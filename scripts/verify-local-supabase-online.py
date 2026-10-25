#!/usr/bin/env python3
"""Exercise local Auth, game-authority, and Storage policies end to end."""

from __future__ import annotations

import json
import shlex
import subprocess
import urllib.error
import urllib.request
import uuid
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class SmokeFailure(RuntimeError):
    pass


def local_environment() -> dict[str, str]:
    result = subprocess.run(
        ["npx", "--yes", "supabase@latest", "status", "--output", "env"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    values: dict[str, str] = {}
    for line in result.stdout.splitlines():
        try:
            key, value = shlex.split(line, posix=True)[0].split("=", 1)
        except (IndexError, ValueError):
            continue
        values[key] = value
    if not values.get("API_URL") or not values.get("ANON_KEY"):
        raise SmokeFailure("Supabase status did not return its local API URL and anon key.")
    return values


class LocalSupabase:
    def __init__(self, api_url: str, anon_key: str) -> None:
        self.api_url = api_url.rstrip("/")
        self.anon_key = anon_key

    def request(
        self,
        path: str,
        *,
        payload: dict[str, object] | bytes | None = None,
        token: str | None = None,
        method: str | None = None,
        content_type: str = "application/json",
    ) -> tuple[int, object]:
        headers = {"apikey": self.anon_key}
        data: bytes | None = None
        if isinstance(payload, bytes):
            data = payload
            headers["content-type"] = content_type
        elif payload is not None:
            data = json.dumps(payload).encode()
            headers["content-type"] = "application/json"
        if token:
            headers["authorization"] = f"Bearer {token}"
        request = urllib.request.Request(
            self.api_url + path,
            data=data,
            headers=headers,
            method=method or ("POST" if data is not None else "GET"),
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                raw = response.read()
                try:
                    body: object = json.loads(raw)
                except (UnicodeDecodeError, json.JSONDecodeError):
                    body = raw
                return response.status, body
        except urllib.error.HTTPError as error:
            raw = error.read()
            try:
                body = json.loads(raw)
            except (UnicodeDecodeError, json.JSONDecodeError):
                body = raw
            return error.code, body

    def sign_in_anonymously(self) -> str:
        status, body = self.request("/auth/v1/signup", payload={})
        if status not in (200, 201) or not isinstance(body, dict) or not isinstance(body.get("access_token"), str):
            raise SmokeFailure(f"Anonymous Auth sign-in failed (HTTP {status}). Enable local anonymous sign-ins.")
        return body["access_token"]


def require_status(step: str, expected: set[int], result: tuple[int, object]) -> object:
    status, body = result
    if status not in expected:
        code = body.get("code") if isinstance(body, dict) else None
        message = body.get("error") or body.get("message") if isinstance(body, dict) else None
        raise SmokeFailure(f"{step} failed (HTTP {status}{', ' + str(code) if code else ''}): {message or 'unexpected response'}")
    return body


def main() -> None:
    env = local_environment()
    supabase = LocalSupabase(env["API_URL"], env["ANON_KEY"])
    host_token = supabase.sign_in_anonymously()
    seeker_token = supabase.sign_in_anonymously()
    outsider_token = supabase.sign_in_anonymously()
    pack = json.loads((ROOT / "samples/generated/jet-lag-the-game.content-pack.json").read_text())
    match_id = "smoke-" + uuid.uuid4().hex[:12]
    host_player_id = "host-" + uuid.uuid4().hex[:8]
    seeker_player_id = "seeker-" + uuid.uuid4().hex[:8]

    created = require_status("Online match create", {200}, supabase.request(
        "/functions/v1/game-authority",
        token=host_token,
        payload={
            "operation": "create_match",
            "matchId": match_id,
            "commandId": "create-" + uuid.uuid4().hex,
            "payload": {
                "mode": "online",
                "contentPackId": pack["packId"],
                "contentPackVersion": pack["packVersion"],
                "hostPlayerId": host_player_id,
                "hostDisplayName": "Smoke Host",
                "initialScale": "small",
            },
        },
    ))
    if not isinstance(created, dict) or not created.get("result", {}).get("accepted") or not created.get("joinCode"):
        raise SmokeFailure("Online match create did not produce an accepted command and join code.")
    join_code = created["joinCode"]
    print("PASS: separate authenticated host creates a match and gets a join code")

    joined = require_status("Online match join", {200}, supabase.request(
        "/functions/v1/game-authority",
        token=seeker_token,
        payload={
            "operation": "join_match",
            "joinCode": join_code,
            "commandId": "join-" + uuid.uuid4().hex,
            "payload": {"playerId": seeker_player_id, "displayName": "Smoke Seeker"},
        },
    ))
    if not isinstance(joined, dict) or not joined.get("result", {}).get("accepted"):
        raise SmokeFailure("The separate seeker phone could not join the match.")
    print("PASS: separate authenticated seeker joins by code")

    for label, token, scope in (
        ("host", host_token, "host_admin"),
        ("seeker", seeker_token, "player_private"),
    ):
        response = require_status(f"{label} snapshot", {200}, supabase.request(
            "/functions/v1/game-authority",
            token=token,
            payload={"operation": "snapshot", "matchId": match_id, "requestedScope": scope},
        ))
        actual_scope = response.get("sync", {}).get("projectionScope") if isinstance(response, dict) else None
        if actual_scope != scope:
            raise SmokeFailure(f"{label} received scope {actual_scope!r}, expected {scope!r}.")
        print(f"PASS: {label} receives its {scope} projection")

    denied = require_status("Outsider snapshot", {403}, supabase.request(
        "/functions/v1/game-authority",
        token=outsider_token,
        payload={"operation": "snapshot", "matchId": match_id, "requestedScope": "host_admin"},
    ))
    if not isinstance(denied, dict) or denied.get("code") != "MATCH_MEMBERSHIP_REQUIRED":
        raise SmokeFailure("Outsider denial did not report missing match membership.")
    print("PASS: outsider cannot read a match projection")

    public_path = f"matches/{match_id}/public_match/public.png"
    private_path = f"matches/{match_id}/player_private/{host_player_id}/private.png"
    minimal_png = b"\x89PNG\r\n\x1a\n"
    require_status("Public evidence upload", {200, 201}, supabase.request(
        "/storage/v1/object/match-attachments/" + public_path,
        payload=minimal_png,
        token=host_token,
        content_type="image/png",
    ))
    require_status("Member public evidence read", {200}, supabase.request(
        "/storage/v1/object/authenticated/match-attachments/" + public_path,
        token=seeker_token,
    ))
    print("PASS: public evidence is readable by both active members")

    require_status("Private evidence upload", {200, 201}, supabase.request(
        "/storage/v1/object/match-attachments/" + private_path,
        payload=minimal_png,
        token=host_token,
        content_type="image/png",
    ))
    require_status("Cross-player private evidence read", {400, 403}, supabase.request(
        "/storage/v1/object/authenticated/match-attachments/" + private_path,
        token=seeker_token,
    ))
    require_status("Outsider evidence upload", {400, 403}, supabase.request(
        "/storage/v1/object/match-attachments/" + f"matches/{match_id}/public_match/outsider.png",
        payload=minimal_png,
        token=outsider_token,
        content_type="image/png",
    ))
    print("PASS: player-private evidence is scoped and outsiders cannot upload")

    removed = require_status("Membership removal", {200}, supabase.request(
        "/functions/v1/game-authority",
        token=host_token,
        payload={
            "operation": "command",
            "matchId": match_id,
            "commandId": "remove-" + uuid.uuid4().hex,
            "command": {"type": "remove_match_player", "payload": {"playerId": seeker_player_id}},
        },
    ))
    if not isinstance(removed, dict) or not removed.get("result", {}).get("accepted"):
        raise SmokeFailure("Host could not remove the seeker membership.")
    require_status("Removed member snapshot", {403}, supabase.request(
        "/functions/v1/game-authority",
        token=seeker_token,
        payload={"operation": "snapshot", "matchId": match_id, "requestedScope": "player_private"},
    ))
    require_status("Removed member evidence read", {400, 403}, supabase.request(
        "/storage/v1/object/authenticated/match-attachments/" + public_path,
        token=seeker_token,
    ))
    print("PASS: removing a member revokes match and evidence access")

    require_status("Direct anon table access", {401, 403}, supabase.request(
        "/rest/v1/matches?select=matchId",
        token=supabase.anon_key,
    ))
    print("PASS: clients cannot bypass the authority through direct table REST")


if __name__ == "__main__":
    try:
        main()
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError, SmokeFailure) as error:
        print(f"FAIL: {error}")
        raise SystemExit(1)
