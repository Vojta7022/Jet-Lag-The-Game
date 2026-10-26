#!/usr/bin/env python3
"""Exercise local Auth, game-authority, and Storage policies end to end."""

from __future__ import annotations

import hashlib
import json
import shlex
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SMOKE_HIDE_PHASE_SECONDS = 8


class SmokeFailure(RuntimeError):
    pass


def create_smoke_pack(pack: dict[str, object]) -> dict[str, object]:
    smoke_pack = json.loads(json.dumps(pack))
    ruleset = next(
        (item for item in smoke_pack.get("rulesets", []) if item.get("rulesetId") == "jet-lag-home-game-base"),
        None,
    )
    phase_policies = ruleset.get("phasePolicies") if isinstance(ruleset, dict) else None
    hide_durations = phase_policies.get("hidePhaseDurationSecondsByScale") if isinstance(phase_policies, dict) else None
    if not isinstance(hide_durations, dict) or "small" not in hide_durations:
        raise SmokeFailure("The standard smoke ruleset does not define a small-game hide timer.")
    hide_durations["small"] = SMOKE_HIDE_PHASE_SECONDS

    fingerprint = hashlib.sha256(
        json.dumps(smoke_pack, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()[:16]
    return {
        **smoke_pack,
        "packId": f"jet-lag-online-smoke-{fingerprint}",
        "packVersion": "0.2.0",
        "title": "Online Distribution Smoke Pack",
    }


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


def value_paths(value: object, targets: set[str], path: str = "$", found: list[str] | None = None) -> list[str]:
    matches = found if found is not None else []
    if isinstance(value, dict):
        for key, child in value.items():
            value_paths(child, targets, f"{path}.{key}", matches)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            value_paths(child, targets, f"{path}[{index}]", matches)
    elif str(value) in targets:
        matches.append(path)
    return matches


def main() -> None:
    env = local_environment()
    supabase = LocalSupabase(env["API_URL"], env["ANON_KEY"])
    host_token = supabase.sign_in_anonymously()
    hider_token = supabase.sign_in_anonymously()
    seeker_token = supabase.sign_in_anonymously()
    removed_token = supabase.sign_in_anonymously()
    outsider_token = supabase.sign_in_anonymously()
    pack = json.loads((ROOT / "samples/generated/jet-lag-the-game.content-pack.json").read_text())
    match_pack = create_smoke_pack(pack)
    match_id = "smoke-" + uuid.uuid4().hex[:12]
    host_player_id = "host-" + uuid.uuid4().hex[:8]
    hider_player_id = "hider-" + uuid.uuid4().hex[:8]
    seeker_player_id = "seeker-" + uuid.uuid4().hex[:8]
    removed_player_id = "removed-" + uuid.uuid4().hex[:8]

    def command(token: str, name: str, payload: dict[str, object]) -> dict[str, object]:
        response = require_status(f"{name} command", {200}, supabase.request(
            "/functions/v1/game-authority",
            token=token,
            payload={
                "operation": "command",
                "matchId": match_id,
                "commandId": name + "-" + uuid.uuid4().hex,
                "command": {"type": name, "payload": payload},
            },
        ))
        if not isinstance(response, dict) or not response.get("result", {}).get("accepted"):
            detail = response.get("result", {}).get("rejection") if isinstance(response, dict) else None
            raise SmokeFailure(f"{name} command was rejected: {detail or 'unexpected response'}")
        return response

    require_status("Content pack publish", {200}, supabase.request(
        "/functions/v1/game-authority",
        token=host_token,
        payload={"operation": "publish_content_pack", "contentPack": match_pack},
    ))
    created = require_status("Online match create", {200}, supabase.request(
        "/functions/v1/game-authority",
        token=host_token,
        payload={
            "operation": "create_match",
            "matchId": match_id,
            "commandId": "create-" + uuid.uuid4().hex,
            "payload": {
                "mode": "online",
                "contentPackId": match_pack["packId"],
                "contentPackVersion": match_pack["packVersion"],
                "hostPlayerId": host_player_id,
                "hostDisplayName": "Smoke Host",
                "initialScale": "small",
            },
        },
    ))
    if not isinstance(created, dict) or not created.get("result", {}).get("accepted") or not created.get("joinCode"):
        raise SmokeFailure("Online match create did not produce an accepted command and join code.")
    join_code = created["joinCode"]
    print("PASS: host publishes an immutable content pack and creates a match pinned to it")

    for label, token, player_id in (
        ("hider", hider_token, hider_player_id),
        ("seeker", seeker_token, seeker_player_id),
        ("removed player", removed_token, removed_player_id),
    ):
        joined = require_status(f"{label} join", {200}, supabase.request(
            "/functions/v1/game-authority",
            token=token,
            payload={
                "operation": "join_match",
                "joinCode": join_code,
                "commandId": "join-" + uuid.uuid4().hex,
                "payload": {"playerId": player_id, "displayName": f"Smoke {label.title()}"},
            },
        ))
        if not isinstance(joined, dict) or not joined.get("result", {}).get("accepted"):
            raise SmokeFailure(f"The separate {label} phone could not join the match.")
    hider_pack = require_status("Joined hider content pack", {200}, supabase.request(
        "/functions/v1/game-authority",
        token=hider_token,
        payload={"operation": "get_content_pack", "matchId": match_id},
    ))
    distributed_pack = hider_pack.get("contentPack") if isinstance(hider_pack, dict) else None
    if not isinstance(distributed_pack, dict) or distributed_pack.get("packVersion") != "0.2.0" or distributed_pack.get("title") != "Online Distribution Smoke Pack":
        raise SmokeFailure("A joined phone did not download the exact immutable content pack version selected by the host.")
    print("PASS: joined players can fetch the match-pinned content pack from the authority")
    print("PASS: separately authenticated hider and seeker join by code")

    command(host_token, "remove_match_player", {"playerId": removed_player_id})
    require_status("Removed member snapshot", {403}, supabase.request(
        "/functions/v1/game-authority",
        token=removed_token,
        payload={"operation": "snapshot", "matchId": match_id, "requestedScope": "player_private"},
    ))
    print("PASS: host removal immediately revokes a joined member")

    command(host_token, "assign_role", {
        "targetPlayerId": hider_player_id,
        "role": "hider",
        "teamId": "team-hider",
    })
    command(host_token, "assign_role", {
        "targetPlayerId": seeker_player_id,
        "role": "seeker",
        "teamId": "team-seeker",
    })
    command(host_token, "confirm_roles", {})
    command(host_token, "set_ruleset", {"rulesetId": "jet-lag-home-game-base"})
    command(host_token, "confirm_rules", {})
    command(host_token, "create_map_region", {
        "regionId": "region-" + uuid.uuid4().hex[:8],
        "displayName": "Prague smoke region",
        "regionKind": "city",
        "featureDatasetRefs": ["osm-core", "transit-registry"],
        "bridgeAvailability": "present",
        "stationSource": "custom",
        "customStations": [{
            "id": "smoke-station",
            "name": "Smoke Station",
            "latitude": 50.21,
            "longitude": 14.21,
        }],
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[14, 50], [14.4, 50], [14.4, 50.4], [14, 50.4], [14, 50]]],
        },
    })
    command(host_token, "start_match", {})
    host_state = require_status("Host role-state snapshot", {200}, supabase.request(
        "/functions/v1/game-authority",
        token=host_token,
        payload={"operation": "snapshot", "matchId": match_id, "requestedScope": "host_admin"},
    ))
    host_projection = host_state.get("sync", {}).get("projectionDelivery", {}).get("projection")
    if not isinstance(host_projection, dict) or host_state.get("sync", {}).get("projectionScope") != "host_admin":
        raise SmokeFailure("The host did not receive the active match projection.")
    current_hider = next((player for player in host_projection.get("players", []) if player.get("role") == "hider"), None)
    current_seeker = next((player for player in host_projection.get("players", []) if player.get("role") == "seeker"), None)
    if not current_hider or not current_seeker:
        raise SmokeFailure("The started round does not have an assigned hider and seeker.")
    hide_timer = next((timer for timer in host_projection.get("visibleTimers", []) if timer.get("kind") == "hide"), None)
    if not hide_timer or hide_timer.get("durationSeconds") != SMOKE_HIDE_PHASE_SECONDS:
        raise SmokeFailure("The online authority did not start the accelerated smoke hide timer.")
    player_sessions = {
        hider_player_id: hider_token,
        seeker_player_id: seeker_token,
    }
    hider_player_id = current_hider["playerId"]
    seeker_player_id = current_seeker["playerId"]
    hider_token = player_sessions[hider_player_id]
    seeker_token = player_sessions[seeker_player_id]
    print("PASS: host assigns roles, chooses a map region, and starts the online match")
    hider_location = {"latitude": 50.21001, "longitude": 14.21001, "accuracyMeters": 5}
    seeker_location = {"latitude": 50.22, "longitude": 14.22, "accuracyMeters": 5}
    command(hider_token, "lock_hider_location", hider_location)
    command(hider_token, "set_hiding_zone", {
        "stationId": "custom:smoke-station",
        "stationName": "Smoke Station",
        "latitude": hider_location["latitude"],
        "longitude": hider_location["longitude"],
    })
    command(hider_token, "update_location", {**hider_location, "source": "device"})
    command(seeker_token, "update_location", {**seeker_location, "source": "device"})
    timer_start = datetime.fromisoformat(hide_timer["startedAt"].replace("Z", "+00:00")).timestamp()
    timer_deadline = timer_start + hide_timer["durationSeconds"]
    time.sleep(max(0, timer_deadline - time.time()) + 0.25)
    timed_state = require_status("Timer-expired host snapshot", {200}, supabase.request(
        "/functions/v1/game-authority",
        token=host_token,
        payload={"operation": "snapshot", "matchId": match_id, "requestedScope": "host_admin"},
    ))
    timed_projection = timed_state.get("sync", {}).get("projectionDelivery", {}).get("projection")
    if not isinstance(timed_projection, dict) or timed_projection.get("lifecycleState") != "seek_phase":
        raise SmokeFailure("Refreshing the online match after hide-timer expiry did not advance into seek phase.")
    print("PASS: the server timer advances the online match into seek phase after the hider is ready")
    question_id = "question:smoke-radar"
    command(seeker_token, "begin_question_prompt", {})
    command(seeker_token, "ask_question", {
        "questionInstanceId": question_id,
        "templateId": "radar-402",
        "targetTeamId": "team-hider",
    })
    seeker_state = require_status("Seeker question snapshot", {200}, supabase.request(
        "/functions/v1/game-authority",
        token=seeker_token,
        payload={"operation": "snapshot", "matchId": match_id, "requestedScope": "player_private"},
    ))
    seeker_projection = seeker_state.get("sync", {}).get("projectionDelivery", {}).get("projection")
    question = next((item for item in seeker_projection.get("visibleQuestions", [])
                     if item.get("questionInstanceId") == question_id), None) if isinstance(seeker_projection, dict) else None
    if not question or question.get("status") != "resolved" or not question.get("automaticResolution"):
        detail = {
            "status": question.get("status") if question else None,
            "hasAnswer": bool(question and question.get("answer")),
            "hasAutomaticProvenance": bool(question and question.get("automaticResolution")),
            "answerMode": question.get("answerMode") if question else None,
        }
        raise SmokeFailure(f"Radar did not resolve automatically from the players' submitted GPS fixes: {detail}.")
    if not seeker_projection.get("visibleMap", {}).get("history"):
        raise SmokeFailure("Automatic Radar answer did not add a map deduction for seekers.")
    print("PASS: online Radar resolves from player GPS and updates the seeker map")

    command(hider_token, "deal_question_reward", {"questionInstanceId": question_id})
    reward_state = require_status("Hider reward snapshot", {200}, supabase.request(
        "/functions/v1/game-authority",
        token=hider_token,
        payload={"operation": "snapshot", "matchId": match_id, "requestedScope": "player_private"},
    ))
    reward_projection = reward_state.get("sync", {}).get("projectionDelivery", {}).get("projection")
    reward_sets = reward_projection.get("pendingQuestionReward", {}).get("sets", []) if isinstance(reward_projection, dict) else []
    if not reward_sets or not reward_sets[0].get("cardInstanceIds"):
        raise SmokeFailure("The hider did not receive the Radar card reward draw.")
    picked_card = reward_sets[0]["cardInstanceIds"][0]
    command(hider_token, "choose_question_reward", {
        "questionInstanceId": question_id,
        "selectedCardInstanceIdsBySet": [[picked_card]],
    })
    chosen_state = require_status("Hider chosen-card snapshot", {200}, supabase.request(
        "/functions/v1/game-authority",
        token=hider_token,
        payload={"operation": "snapshot", "matchId": match_id, "requestedScope": "player_private"},
    ))
    chosen_projection = chosen_state.get("sync", {}).get("projectionDelivery", {}).get("projection")
    if not isinstance(chosen_projection, dict) or not any(
        card.get("cardInstanceId") == picked_card and card.get("zone") == "hand"
        for card in chosen_projection.get("visibleCards", [])
    ):
        raise SmokeFailure("The selected reward card did not enter the hider's hand.")
    print("PASS: hider draws and chooses the printed question card reward in-app")

    for label, token, scope in (
        ("hider", hider_token, "player_private"),
        ("seeker", seeker_token, "player_private"),
    ):
        response = require_status(f"{label} active-round snapshot", {200}, supabase.request(
            "/functions/v1/game-authority",
            token=token,
            payload={"operation": "snapshot", "matchId": match_id, "requestedScope": scope},
        ))
        actual_scope = response.get("sync", {}).get("projectionScope") if isinstance(response, dict) else None
        if actual_scope != scope:
            raise SmokeFailure(f"{label} received scope {actual_scope!r}, expected {scope!r}.")
        projection = response.get("sync", {}).get("projectionDelivery", {}).get("projection")
        if not isinstance(projection, dict) or projection.get("lifecycleState") != "seek_phase":
            raise SmokeFailure(f"{label} did not receive the active seek-phase projection.")
        visible_question = next((item for item in projection.get("visibleQuestions", [])
                                 if item.get("questionInstanceId") == question_id), None)
        if not visible_question or visible_question.get("status") != "resolved" or not visible_question.get("automaticResolution"):
            raise SmokeFailure(f"{label} cannot see the resolved automatic Radar answer.")
        tracks = projection.get("visibleMovementTracks", [])
        track_ids = {track.get("playerId") for track in tracks if isinstance(track, dict)}
        if label == "hider" and seeker_player_id not in track_ids:
            raise SmokeFailure("Hider projection does not show the seeker's live position.")
        if label == "seeker":
            if hider_player_id in track_ids:
                raise SmokeFailure("Seeker projection leaked the hider's movement track.")
            coordinate_paths = value_paths(projection, {
                str(hider_location["latitude"]),
                str(hider_location["longitude"]),
            })
            if coordinate_paths:
                raise SmokeFailure(f"Seeker projection contains hider coordinate values at {coordinate_paths}.")
    print("PASS: hider sees the seeker track while the seeker projection excludes the hider GPS fix")

    command(hider_token, "set_final_hiding_spot", {
        "latitude": hider_location["latitude"],
        "longitude": hider_location["longitude"],
        "publiclyAccessible": True,
        "within3mOfMarkedPath": True,
    })
    command(seeker_token, "update_location", {**hider_location, "source": "device", "onTransit": False})
    endgame_state = require_status("Endgame snapshot", {200}, supabase.request(
        "/functions/v1/game-authority",
        token=seeker_token,
        payload={"operation": "snapshot", "matchId": match_id, "requestedScope": "player_private"},
    ))
    endgame_projection = endgame_state.get("sync", {}).get("projectionDelivery", {}).get("projection")
    if not isinstance(endgame_projection, dict) or endgame_projection.get("lifecycleState") != "endgame":
        raise SmokeFailure("A seeker fix at the hider's final spot did not trigger endgame.")
    command(seeker_token, "confirm_hider_found", {
        "latitude": hider_location["latitude"],
        "longitude": hider_location["longitude"],
        "visuallyIdentified": True,
    })
    completed_state = require_status("Completed round snapshot", {200}, supabase.request(
        "/functions/v1/game-authority",
        token=host_token,
        payload={"operation": "snapshot", "matchId": match_id, "requestedScope": "host_admin"},
    ))
    completed_projection = completed_state.get("sync", {}).get("projectionDelivery", {}).get("projection")
    if not isinstance(completed_projection, dict) or completed_projection.get("lifecycleState") != "game_complete":
        raise SmokeFailure("The found confirmation did not complete and score the round.")
    if not completed_projection.get("visibleRoundResults"):
        raise SmokeFailure("The completed round has no visible score record.")
    print("PASS: the seeker triggers endgame, confirms the find, and records the round score")

    denied = require_status("Outsider snapshot", {403}, supabase.request(
        "/functions/v1/game-authority",
        token=outsider_token,
        payload={"operation": "snapshot", "matchId": match_id, "requestedScope": "host_admin"},
    ))
    if not isinstance(denied, dict) or denied.get("code") != "MATCH_MEMBERSHIP_REQUIRED":
        raise SmokeFailure("Outsider denial did not report missing match membership.")
    print("PASS: outsider cannot read a match projection")

    public_path = f"matches/{match_id}/public_match/public.png"
    private_path = f"matches/{match_id}/player_private/{hider_player_id}/private.png"
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
        token=hider_token,
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

    require_status("Removed member evidence read", {400, 403}, supabase.request(
        "/storage/v1/object/authenticated/match-attachments/" + public_path,
        token=removed_token,
    ))
    print("PASS: removing a member revokes evidence access")

    require_status("Direct anon table access", {401, 403}, supabase.request(
        "/rest/v1/matches?select=matchId",
        token=supabase.anon_key,
    ))
    print("PASS: clients cannot bypass the authority through direct table REST")

    command(host_token, "start_next_round", {"nextHiderPlayerId": seeker_player_id})
    rotated_state = require_status("Next-round snapshot", {200}, supabase.request(
        "/functions/v1/game-authority",
        token=host_token,
        payload={"operation": "snapshot", "matchId": match_id, "requestedScope": "host_admin"},
    ))
    rotated_projection = rotated_state.get("sync", {}).get("projectionDelivery", {}).get("projection")
    if not isinstance(rotated_projection, dict):
        raise SmokeFailure("The host did not receive the next-round projection.")
    roles_after_rotation = {
        player.get("playerId"): player.get("role")
        for player in rotated_projection.get("players", [])
    }
    if rotated_projection.get("lifecycleState") != "hide_phase" or roles_after_rotation.get(seeker_player_id) != "hider":
        raise SmokeFailure("The completed match did not start its next round with the next hider.")
    print("PASS: the next hider rotation starts a fresh online round")


if __name__ == "__main__":
    try:
        main()
    except (OSError, subprocess.CalledProcessError, json.JSONDecodeError, SmokeFailure) as error:
        print(f"FAIL: {error}")
        raise SystemExit(1)
