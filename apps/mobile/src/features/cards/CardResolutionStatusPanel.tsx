import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { MatchProjection, MatchRole, QuestionCategoryDefinition, QuestionTemplateDefinition, ScaleKey, ZoologistAnimalCategory } from '../../../../../packages/shared-types/src/index.ts';
import type { ResolvedVisibleCardModel } from './card-catalog.ts';

import { CardAutomationPill } from './CardAutomationPill.tsx';
import {
  buildCardBehaviorModel,
  buildResolutionWindowGuidance,
  formatCardKindLabel
} from './card-guidance.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';
import { describeQuestionTemplateForPlayers } from '../questions/question-guidance.ts';

interface CardResolutionStatusPanelProps {
  activeCard?: ResolvedVisibleCardModel;
  copiedCard?: ResolvedVisibleCardModel;
  resolution?: MatchProjection['activeCardResolution'];
  disabled?: boolean;
  canResolve: boolean;
  resolveDisabledReason?: string;
  questionCategories?: QuestionCategoryDefinition[];
  questionTemplates?: QuestionTemplateDefinition[];
  selectedScale?: ScaleKey;
  viewerRole?: MatchRole;
  onSetHangmanWord?: (word: string) => void;
  onGuessHangmanLetter?: (letter: string) => void;
  onEndHangmanChallenge?: () => void;
  onResolveEndlessTumbleCast?: (dieRoll: number) => void;
  onResolveGamblersFeetCast?: (dieRoll: number) => void;
  zoologistHiderAttachmentId?: string;
  luxuryCarHiderAttachmentId?: string;
  labyrinthHiderAttachmentId?: string;
  unguidedTouristHiderAttachmentId?: string;
  birdGuideHiderAttachmentId?: string;
  unguidedTouristOutdoorsConfirmedByPlayerIds?: string[];
  unguidedTouristSeekerPlayerIds?: string[];
  viewerPlayerId?: string;
  onConfirmUnguidedTouristOutdoors?: () => void;
  labyrinthPhotoHint?: string;
  onPublishLabyrinthMaze?: (attachmentId: string) => void;
  onSubmitLabyrinthSolution?: (solutionText: string) => void;
  onReviewLabyrinthSolution?: (approved: boolean) => void;
  onResolve: (
    questionTemplateIds: string[],
    zoologistSelection?: { category: ZoologistAnimalCategory; hiderAttachmentId: string },
    luxuryCarSelection?: { hiderAttachmentId: string; description: string; productionYear: number; msrpCents: number; currencyCode: string },
    uTurnSelection?: { nextStationName: string; preconditionsConfirmed: true },
    ransomNoteSelection?: { castingCostConfirmed: true },
    cairnSelection?: { targetHeight: number; targetConfirmed: true },
    unguidedTouristSelection?: { hiderAttachmentId: string; rulesAttested: true },
    birdGuideSelection?: { hiderAttachmentId: string; birdPresentAttested: true }
  ) => void;
}

export function CardResolutionStatusPanel(props: CardResolutionStatusPanelProps) {
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [hangmanWord, setHangmanWord] = useState('');
  const [hangmanLetter, setHangmanLetter] = useState('');
  const [endlessTumbleCastRoll, setEndlessTumbleCastRoll] = useState<number | undefined>();
  const [gamblersFeetCastRoll, setGamblersFeetCastRoll] = useState<number | undefined>();
  const [zoologistCategory, setZoologistCategory] = useState<ZoologistAnimalCategory | undefined>();
  const [luxuryCarDescription, setLuxuryCarDescription] = useState('');
  const [luxuryCarProductionYear, setLuxuryCarProductionYear] = useState('');
  const [luxuryCarMsrp, setLuxuryCarMsrp] = useState('');
  const [luxuryCarCurrencyCode, setLuxuryCarCurrencyCode] = useState('USD');
  const [uTurnNextStationName, setUTurnNextStationName] = useState('');
  const [uTurnPreconditionsConfirmed, setUTurnPreconditionsConfirmed] = useState(false);
  const [ransomNoteCastingCostConfirmed, setRansomNoteCastingCostConfirmed] = useState(false);
  const [cairnTargetHeight, setCairnTargetHeight] = useState('');
  const [cairnTargetConfirmed, setCairnTargetConfirmed] = useState(false);
  const [labyrinthSolution, setLabyrinthSolution] = useState('');
  const [unguidedTouristRulesAttested, setUnguidedTouristRulesAttested] = useState(false);
  const [birdGuideFrameAttested, setBirdGuideFrameAttested] = useState(false);
  const [clockNow, setClockNow] = useState(Date.now());
  useEffect(() => {
    setSelectedTemplateIds([]);
    setHangmanWord('');
    setHangmanLetter('');
    setEndlessTumbleCastRoll(undefined);
    setGamblersFeetCastRoll(undefined);
    setZoologistCategory(undefined);
    setLuxuryCarDescription('');
    setLuxuryCarProductionYear('');
    setLuxuryCarMsrp('');
    setLuxuryCarCurrencyCode('USD');
    setUTurnNextStationName('');
    setUTurnPreconditionsConfirmed(false);
    setRansomNoteCastingCostConfirmed(false);
    setCairnTargetHeight('');
    setCairnTargetConfirmed(false);
    setLabyrinthSolution('');
    setUnguidedTouristRulesAttested(false);
    setBirdGuideFrameAttested(false);
  }, [props.resolution?.sourceCardInstanceId]);
  useEffect(() => {
    if (props.resolution?.resolutionKind !== 'labyrinth_challenge') return;
    const timer = setInterval(() => setClockNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [props.resolution?.sourceCardInstanceId, props.resolution?.resolutionKind]);
  const guidance = buildResolutionWindowGuidance(props.activeCard, props.canResolve);
  const behavior = props.activeCard ? buildCardBehaviorModel(props.activeCard.definition) : undefined;
  const discardRequirement = props.resolution?.discardRequirement;
  const discardDetail = discardRequirement?.discardWholeHand
    ? 'Discard the rest of the opening hand before closing this window.'
    : discardRequirement?.requiredCards
      ? discardRequirement.requiredKind
        ? `Discard ${discardRequirement.requiredCards} ${discardRequirement.requiredKind.replace(/_/g, ' ')} card${discardRequirement.requiredCards === 1 ? '' : 's'} first.`
        : `Discard ${discardRequirement.requiredCards} other card${discardRequirement.requiredCards === 1 ? '' : 's'} first.`
      : undefined;
  const followThroughDetail = props.resolution?.drawCountOnResolve
    ? `Closing this window draws ${props.resolution.drawCountOnResolve} replacement card${props.resolution.drawCountOnResolve === 1 ? '' : 's'}.`
    : props.resolution?.timeBonusMinutes
      ? `This bonus adds ${props.resolution.timeBonusMinutes} minute${props.resolution.timeBonusMinutes === 1 ? '' : 's'} to final hiding time only if held when found.`
      : undefined;
  const questionSelectionRequired = props.resolution?.resolutionKind === 'disable_question_templates';
  const hangmanChallenge = props.resolution?.resolutionKind === 'hangman_challenge';
  const bridgeTrollChallenge = props.resolution?.resolutionKind === 'bridge_troll_challenge';
  const seekerOffTransitChallenge = props.resolution?.resolutionKind === 'seeker_off_transit_challenge';
  const waterWeightChallenge = props.resolution?.resolutionKind === 'water_weight_challenge';
  const endlessTumbleChallenge = props.resolution?.resolutionKind === 'endless_tumble_challenge';
  const gamblersFeetChallenge = props.resolution?.resolutionKind === 'gamblers_feet_challenge';
  const zoologistChallenge = props.resolution?.resolutionKind === 'zoologist_challenge';
  const luxuryCarChallenge = props.resolution?.resolutionKind === 'luxury_car_challenge';
  const uTurnChallenge = props.resolution?.resolutionKind === 'u_turn_challenge';
  const ransomNoteChallenge = props.resolution?.resolutionKind === 'ransom_note_challenge';
  const cairnChallenge = props.resolution?.resolutionKind === 'cairn_challenge';
  const labyrinthChallenge = props.resolution?.resolutionKind === 'labyrinth_challenge';
  const rightTurnChallenge = props.resolution?.resolutionKind === 'right_turn_challenge';
  const unguidedTouristChallenge = props.resolution?.resolutionKind === 'unguided_tourist_challenge';
  const birdGuideChallenge = props.resolution?.resolutionKind === 'bird_guide_challenge';
  const touristConfirmed = props.unguidedTouristOutdoorsConfirmedByPlayerIds ?? [];
  const touristSeekers = props.unguidedTouristSeekerPlayerIds ?? [];
  const touristOutdoorsComplete = touristSeekers.every((playerId) => touristConfirmed.includes(playerId));
  const labyrinth = props.resolution?.labyrinth;
  const labyrinthDrawingDeadline = props.resolution?.openedAt && props.resolution.labyrinthDrawingWindowMinutes
    ? Date.parse(props.resolution.openedAt) + props.resolution.labyrinthDrawingWindowMinutes * 60_000
    : undefined;
  const labyrinthTimeLeftSeconds = labyrinthDrawingDeadline
    ? Math.max(0, Math.ceil((labyrinthDrawingDeadline - clockNow) / 1000))
    : undefined;
  const hangman = props.resolution?.hangman;
  const requiredQuestionCount = props.resolution?.questionTemplateCount ?? 0;
  const normalizedLuxuryCarMsrp = luxuryCarMsrp.trim();
  const luxuryCarMsrpCents = Number(normalizedLuxuryCarMsrp) * 100;
  const luxuryCarFormValid = Boolean(
    props.luxuryCarHiderAttachmentId && luxuryCarDescription.trim().length >= 2 &&
    /^(18[89]\d|19\d{2}|20\d{2}|2100)$/.test(luxuryCarProductionYear) &&
    /^\d+(?:\.\d{1,2})?$/.test(normalizedLuxuryCarMsrp) &&
    Number.isSafeInteger(luxuryCarMsrpCents) && luxuryCarMsrpCents > 0 &&
    /^[A-Z]{3}$/.test(luxuryCarCurrencyCode.trim().toUpperCase())
  );
  const canSubmit = props.canResolve &&
    (!questionSelectionRequired || selectedTemplateIds.length === requiredQuestionCount) &&
    (!hangmanChallenge || hangman?.status === 'solved' || hangman?.status === 'ended') &&
    (!zoologistChallenge || (Boolean(zoologistCategory) && Boolean(props.zoologistHiderAttachmentId))) &&
    (!luxuryCarChallenge || luxuryCarFormValid) &&
    (!uTurnChallenge || (uTurnNextStationName.trim().length >= 2 && uTurnPreconditionsConfirmed)) &&
    (!ransomNoteChallenge || ransomNoteCastingCostConfirmed) &&
    (!cairnChallenge || (Number.isSafeInteger(Number(cairnTargetHeight)) && Number(cairnTargetHeight) >= 1 && cairnTargetConfirmed)) &&
    (!labyrinthChallenge || labyrinth?.status === 'solved') &&
    (!unguidedTouristChallenge || (Boolean(props.unguidedTouristHiderAttachmentId) && touristOutdoorsComplete && unguidedTouristRulesAttested)) &&
    (!birdGuideChallenge || (Boolean(props.birdGuideHiderAttachmentId) && birdGuideFrameAttested)) &&
    !endlessTumbleChallenge && !gamblersFeetChallenge;

  const hangmanPanel = hangmanChallenge ? (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>HANGMAN CHALLENGE</Text>
      <Text style={styles.hangmanWord}>{hangman?.maskedWord?.split('').join('  ') ?? '_  _  _  _  _'}</Text>
      <Text style={styles.copy}>
        {hangman?.status === 'awaiting_word'
          ? 'The hider chooses a real five-letter dictionary word in the group’s language.'
          : hangman?.status === 'solved'
            ? 'Solved! The hider can close the curse now.'
            : hangman?.status === 'ended'
              ? `Challenge over. The word was ${hangman.revealedWord ?? hangman.maskedWord}.`
              : 'Seekers must finish their group’s game of Hangman before questions or transit can resume.'}
      </Text>
      {hangman?.guessedLetters.length ? (
        <Text style={styles.metaChip}>Guessed: {hangman.guessedLetters.join(' · ')}</Text>
      ) : null}
      {hangman?.incorrectLetters.length ? (
        <Text style={styles.warning}>Misses: {hangman.incorrectLetters.join(' · ')}</Text>
      ) : null}
      {hangman?.status === 'awaiting_word' && (props.viewerRole === 'hider' || props.viewerRole === 'host') && props.onSetHangmanWord ? (
        <>
          <TextInput
            accessibilityLabel="Five-letter Hangman word"
            autoCapitalize="characters"
            maxLength={5}
            onChangeText={(value) => setHangmanWord(value.replace(/[^\p{L}]/gu, '').toUpperCase())}
            placeholder="ENTER WORD"
            style={styles.hangmanInput}
            value={hangmanWord}
          />
          <AppButton
            label="Set Secret Word"
            disabled={props.disabled || Array.from(hangmanWord).length !== 5}
            onPress={() => props.onSetHangmanWord?.(hangmanWord)}
          />
        </>
      ) : null}
      {hangman?.status === 'playing' && props.viewerRole === 'seeker' && props.onGuessHangmanLetter ? (
        <View style={styles.hangmanGuessRow}>
          <TextInput
            accessibilityLabel="Guess a Hangman letter"
            autoCapitalize="characters"
            maxLength={1}
            onChangeText={(value) => setHangmanLetter(value.replace(/[^\p{L}]/gu, '').toUpperCase())}
            placeholder="?"
            style={[styles.hangmanInput, styles.hangmanLetterInput]}
            value={hangmanLetter}
          />
          <AppButton
            label="Guess Letter"
            disabled={props.disabled || Array.from(hangmanLetter).length !== 1 || hangman?.guessedLetters.includes(hangmanLetter)}
            onPress={() => {
              props.onGuessHangmanLetter?.(hangmanLetter);
              setHangmanLetter('');
            }}
          />
        </View>
      ) : null}
      {hangman?.status === 'playing' && (props.viewerRole === 'hider' || props.viewerRole === 'host') && props.onEndHangmanChallenge ? (
        <>
          <Text style={styles.copy}>The hider ends this only after the seekers have lost by the group’s Hangman rules; the word will then be revealed.</Text>
          <AppButton label="Seekers Lost — End Challenge" tone="secondary" disabled={props.disabled} onPress={props.onEndHangmanChallenge} />
        </>
      ) : null}
    </View>
  ) : null;

  if (!props.activeCard) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{guidance.title}</Text>
        {props.resolution?.resolutionKind === 'move' ? (
          <>
            <Text style={styles.copy}>
              Original transit station: {props.resolution.moveOriginStationName ?? 'not recorded'}.
            </Text>
            <Text style={styles.copy}>
              Seekers stay in place and do not ask questions while the hider moves. The hider must choose a different station, travel by valid transit, and confirm arrival. The engine enforces the selected game-size timer ({Math.ceil((props.resolution.moveDurationSeconds ?? 0) / 60)} minutes) before the window can end.
            </Text>
          </>
        ) : null}
        {bridgeTrollChallenge ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>BRIDGE TROLL</Text>
            <Text style={styles.copy}>
              Close this card window to activate the curse. Before the next question, every seeker must be under the same qualifying bridge and confirm from their own phone. The app will block the question until every seeker has a recent confirmation.
            </Text>
          </View>
        ) : null}
        {seekerOffTransitChallenge ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>URBAN EXPLORER</Text>
            <Text style={styles.copy}>
              Close this card window to activate the restriction. Until the hider run ends, each seeker must update their own status; questions remain blocked while anyone is on transit, on a station platform, or in a station building.
            </Text>
          </View>
        ) : null}
        {unguidedTouristChallenge ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>UNGUIDED TOURIST · CHECK IN</Text>
            <Text style={styles.copy}>The hider is sharing an unzoomed Street View image from within 152 m of the seekers’ current location. Find the pictured human-built structure in person; a road, curb, or sidewalk does not count.</Text>
            {touristSeekers.map((playerId) => <Text key={playerId} style={styles.metaChip}>{playerId}: {touristConfirmed.includes(playerId) ? 'outside ✓' : 'outside check-in needed'}</Text>)}
            {props.viewerRole === 'seeker' && props.viewerPlayerId && !touristConfirmed.includes(props.viewerPlayerId) ? (
              <AppButton label="I’m outside" disabled={props.disabled || !props.onConfirmUnguidedTouristOutdoors} onPress={() => props.onConfirmUnguidedTouristOutdoors?.()} />
            ) : null}
            {props.viewerRole === 'hider' || props.viewerRole === 'host' ? (
              <Text style={styles.copy}>{props.unguidedTouristHiderAttachmentId ? 'Clue photo recorded. Close this card after every seeker confirms they are outside.' : 'Choose the Street View screenshot in Card Evidence below.'}</Text>
            ) : null}
          </View>
        ) : null}
        {waterWeightChallenge ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>WATER WEIGHT</Text>
            <Text style={styles.copy}>
              Close this window to activate the seeker supply requirement. Seekers must acquire new liquid totaling 2 liters per seeker before they can ask another question. If it is lost or abandoned, the hider receives {props.resolution?.timeBonusMinutes ?? 0} minutes added to the final score. The seekers report acquisition and loss; when set down, liquid is abandoned only when all seekers are more than 3 m away.
            </Text>
          </View>
        ) : null}
        {hangmanPanel}
        <Text style={styles.copy}>{guidance.detail}</Text>
        <Text style={styles.copy}>{guidance.nextStep}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.title}>{guidance.title}</Text>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={styles.cardName}>{props.activeCard.definition.name}</Text>
            {props.copiedCard ? <Text style={styles.copy}>Copying {props.copiedCard.definition.name}</Text> : null}
            <Text style={styles.copy}>
              {formatCardKindLabel(props.activeCard.definition.kind)} from {props.activeCard.deck.name}
            </Text>
            <Text style={styles.copy}>{props.activeCard.definition.description}</Text>
          </View>
          {behavior ? <CardAutomationPill label={behavior.label} tone={behavior.tone} /> : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Lock</Text>
        <Text style={styles.copy}>{guidance.detail}</Text>
        {props.copiedCard ? (
          <Text style={styles.metaChip}>
            Copied effect: {props.copiedCard.definition.description}
          </Text>
        ) : null}
        {discardDetail ? <Text style={styles.metaChip}>{discardDetail}</Text> : null}
        {followThroughDetail ? <Text style={styles.metaChip}>{followThroughDetail}</Text> : null}
        {questionSelectionRequired ? (
          <View style={styles.categoryPicker}>
            <Text style={styles.copy}>Choose {requiredQuestionCount} questions, each from a different category. Seekers cannot ask those exact questions for the rest of this hider run.</Text>
            <View style={styles.categoryList}>
              {(props.questionCategories ?? []).map((category) => {
                const selectedInCategory = selectedTemplateIds.find((templateId) =>
                  props.questionTemplates?.some((template) => template.templateId === templateId && template.categoryId === category.categoryId)
                );
                return (
                  <View key={category.categoryId} style={styles.categoryGroup}>
                    <Text style={styles.categoryHeading}>{category.name}</Text>
                    {(props.questionTemplates ?? []).filter((template) =>
                      template.categoryId === category.categoryId &&
                      (!props.selectedScale || template.scaleSet.appliesTo.includes(props.selectedScale))
                    ).map((template) => {
                      const selected = selectedTemplateIds.includes(template.templateId);
                      const categoryAlreadyChosen = Boolean(selectedInCategory) && !selected;
                      const atLimit = selectedTemplateIds.length >= requiredQuestionCount;
                      return (
                        <Pressable
                          key={template.templateId}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected, disabled: categoryAlreadyChosen || (!selected && atLimit) }}
                          disabled={categoryAlreadyChosen || (!selected && atLimit)}
                          onPress={() => setSelectedTemplateIds((current) => selected
                            ? current.filter((id) => id !== template.templateId)
                            : [...current, template.templateId])}
                          style={[styles.categoryOption, selected ? styles.categoryOptionSelected : null]}
                        >
                          <View style={styles.templateOptionCopy}>
                            <Text style={[styles.categoryLabel, selected ? styles.categoryLabelSelected : null]}>{template.name}</Text>
                            <Text style={styles.templatePrompt}>{describeQuestionTemplateForPlayers(template, category)}</Text>
                          </View>
                          <Text style={[styles.categoryState, selected ? styles.categoryLabelSelected : null]}>{selected ? 'LOCKED' : 'SELECT'}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                );
              })}
            </View>
            <Text style={styles.copy}>{selectedTemplateIds.length} / {requiredQuestionCount} selected</Text>
          </View>
        ) : null}
      </View>

      {hangmanPanel}

      {endlessTumbleChallenge ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CASTING ROLL</Text>
          <Text style={styles.copy}>The hider rolls a physical six-sided die. On {props.resolution?.endlessTumbleSuccessfulDieResults?.join(' or ') ?? '5 or 6'} the curse has no effect; on another result the seekers must complete the {props.resolution?.endlessTumbleMinimumDistanceMeters ?? 30} m roll before their next question.</Text>
          {props.viewerRole === 'hider' || props.viewerRole === 'host' ? (
            <>
              <View style={styles.hangmanGuessRow}>
                {[1, 2, 3, 4, 5, 6].map((value) => (
                  <Pressable key={value} onPress={() => setEndlessTumbleCastRoll(value)} style={[styles.categoryOption, endlessTumbleCastRoll === value ? styles.categoryOptionSelected : null]}>
                    <Text style={[styles.categoryLabel, endlessTumbleCastRoll === value ? styles.categoryLabelSelected : null]}>{value}</Text>
                  </Pressable>
                ))}
              </View>
              <AppButton
                label={endlessTumbleCastRoll ? `Record casting roll: ${endlessTumbleCastRoll}` : 'Choose the die result'}
                disabled={props.disabled || endlessTumbleCastRoll === undefined || !props.onResolveEndlessTumbleCast}
                onPress={() => {
                  if (endlessTumbleCastRoll !== undefined) props.onResolveEndlessTumbleCast?.(endlessTumbleCastRoll);
                }}
              />
            </>
          ) : <Text style={styles.copy}>Waiting for the hider to report the casting die.</Text>}
        </View>
      ) : null}

      {gamblersFeetChallenge ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>GAMBLER’S FEET CASTING ROLL</Text>
          <Text style={styles.copy}>The hider rolls a six-sided die. An even result cancels the curse; an odd result starts it for {props.resolution?.gamblersFeetDurationMinutes ?? 20} minutes. Seekers may roll independently; each die result allows up to that many steps.</Text>
          {props.viewerRole === 'hider' || props.viewerRole === 'host' ? (
            <>
              <View style={styles.hangmanGuessRow}>
                {[1, 2, 3, 4, 5, 6].map((value) => (
                  <Pressable key={value} onPress={() => setGamblersFeetCastRoll(value)} style={[styles.categoryOption, gamblersFeetCastRoll === value ? styles.categoryOptionSelected : null]}>
                    <Text style={[styles.categoryLabel, gamblersFeetCastRoll === value ? styles.categoryLabelSelected : null]}>{value}</Text>
                  </Pressable>
                ))}
              </View>
              <AppButton label={gamblersFeetCastRoll ? `Record casting roll: ${gamblersFeetCastRoll}` : 'Choose the die result'} disabled={props.disabled || gamblersFeetCastRoll === undefined || !props.onResolveGamblersFeetCast} onPress={() => gamblersFeetCastRoll !== undefined && props.onResolveGamblersFeetCast?.(gamblersFeetCastRoll)} />
            </>
          ) : <Text style={styles.copy}>Waiting for the hider to report the casting die.</Text>}
        </View>
      ) : null}

      {zoologistChallenge ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ZOOLOGIST PHOTO CHALLENGE</Text>
          <Text style={styles.copy}>Choose the category shown in your wild-animal photo. Every seeker will need their own photo of a wild animal in the same category before questions resume.</Text>
          <View style={styles.hangmanGuessRow}>
            {(['fish', 'bird', 'mammal', 'reptile', 'amphibian', 'bug'] as const).map((category) => (
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: zoologistCategory === category }}
                key={category}
                onPress={() => setZoologistCategory(category)}
                style={[styles.categoryOption, zoologistCategory === category ? styles.categoryOptionSelected : undefined]}
              >
                <Text style={[styles.categoryLabel, zoologistCategory === category ? styles.categoryLabelSelected : undefined]}>{category}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.metaChip}>{props.zoologistHiderAttachmentId ? 'Your public photo is recorded.' : 'Capture and record your photo below first.'}</Text>
          <Text style={styles.copy}>Players decide whether a photo shows a wild animal in the selected category. The app does not identify species or determine whether an animal is wild.</Text>
        </View>
      ) : null}

      {luxuryCarChallenge ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LUXURY CAR COMPARISON</Text>
          <Text style={styles.copy}>Photograph a car and enter its production-year MSRP. Seekers must find a car with a higher MSRP in the same currency. Compare the original MSRP only; ignore paid upgrades and modifications.</Text>
          <TextInput accessibilityLabel="Hider car description" onChangeText={setLuxuryCarDescription} placeholder="Make and model" style={styles.hangmanInput} value={luxuryCarDescription} />
          <TextInput accessibilityLabel="Hider car production year" keyboardType="number-pad" maxLength={4} onChangeText={setLuxuryCarProductionYear} placeholder="Production year" style={styles.hangmanInput} value={luxuryCarProductionYear} />
          <TextInput accessibilityLabel="Hider car MSRP" keyboardType="decimal-pad" onChangeText={setLuxuryCarMsrp} placeholder="MSRP (e.g. 42000.00)" style={styles.hangmanInput} value={luxuryCarMsrp} />
          <TextInput accessibilityLabel="MSRP currency code" autoCapitalize="characters" maxLength={3} onChangeText={(value) => setLuxuryCarCurrencyCode(value.toUpperCase())} placeholder="USD" style={styles.hangmanInput} value={luxuryCarCurrencyCode} />
          <Text style={styles.metaChip}>{props.luxuryCarHiderAttachmentId ? 'Your public reference-car photo is recorded.' : 'Take and record the reference-car photo below first.'}</Text>
          <Text style={styles.copy}>If the model or year is uncertain, the hider and seekers agree on the comparison details. The app checks the reported price and records the hider’s decision; players verify the actual car and MSRP source.</Text>
        </View>
      ) : null}

      {labyrinthChallenge ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>LABYRINTH CHALLENGE</Text>
          <Text style={styles.copy}>
            The hider has up to {props.resolution?.labyrinthDrawingWindowMinutes ?? 10} minutes to draw and photograph a solvable maze. Restarting the drawing does not restart the timer; the hider must not use the internet or other materials to design it.
          </Text>
          {labyrinthTimeLeftSeconds !== undefined ? (
            <Text style={labyrinthTimeLeftSeconds > 0 ? styles.metaChip : styles.warning}>
              {labyrinthTimeLeftSeconds > 0
                ? `Drawing time ${Math.floor(labyrinthTimeLeftSeconds / 60)}:${String(labyrinthTimeLeftSeconds % 60).padStart(2, '0')}`
                : 'The printed drawing window has elapsed; the group should apply the card rule.'}
            </Text>
          ) : null}
          <Text style={styles.copy}>
            {labyrinth?.status === 'awaiting_maze'
              ? 'The hider must publish a public camera photo of the hand-drawn maze.'
              : labyrinth?.status === 'solving'
                ? 'Seekers should solve the published maze together and submit their route or answer.'
                : labyrinth?.status === 'awaiting_hider_review'
                  ? 'The hider is reviewing the submitted solution.'
                  : labyrinth?.status === 'solved'
                    ? 'Maze solved. The hider can close this card and questions can resume.'
                    : 'Waiting for the challenge state to sync.'}
          </Text>
          {props.viewerRole === 'hider' || props.viewerRole === 'host' ? (
            <>
              {labyrinth?.status === 'awaiting_maze' || labyrinth?.status === 'solving' ? (
                <>
                  <Text style={styles.metaChip}>{props.labyrinthHiderAttachmentId ? 'Maze photo is recorded.' : props.labyrinthPhotoHint ?? 'Take a photo from the Card Evidence section below.'}</Text>
                  <AppButton
                    label="Publish Maze to Seekers"
                    disabled={props.disabled || !props.labyrinthHiderAttachmentId || !props.onPublishLabyrinthMaze}
                    onPress={() => props.labyrinthHiderAttachmentId && props.onPublishLabyrinthMaze?.(props.labyrinthHiderAttachmentId)}
                  />
                </>
              ) : null}
              {labyrinth?.status === 'awaiting_hider_review' ? (
                <>
                  <Text style={styles.metaChip}>Submitted solution: {labyrinth.solutionText}</Text>
                  <View style={styles.hangmanGuessRow}>
                    <AppButton label="Needs another try" disabled={props.disabled || !props.onReviewLabyrinthSolution} onPress={() => props.onReviewLabyrinthSolution?.(false)} />
                    <AppButton label="Solution is correct" disabled={props.disabled || !props.onReviewLabyrinthSolution} onPress={() => props.onReviewLabyrinthSolution?.(true)} />
                  </View>
                </>
              ) : null}
            </>
          ) : null}
          {props.viewerRole === 'seeker' && labyrinth?.status === 'solving' ? (
            <>
              <TextInput
                accessibilityLabel="Maze solution"
                multiline
                onChangeText={setLabyrinthSolution}
                placeholder="Describe your path through the maze"
                style={styles.hangmanInput}
                value={labyrinthSolution}
              />
              <AppButton
                label="Submit maze solution"
                disabled={props.disabled || !labyrinthSolution.trim() || !props.onSubmitLabyrinthSolution}
                onPress={() => props.onSubmitLabyrinthSolution?.(labyrinthSolution.trim())}
              />
            </>
          ) : null}
          {labyrinth?.status === 'solving' && (labyrinth.rejectedAttemptCount ?? 0) > 0 ? (
            <Text style={styles.warning}>The previous route was not accepted. Seekers may try again.</Text>
          ) : null}
        </View>
      ) : null}

      {rightTurnChallenge ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Timed route challenge</Text>
          <Text style={styles.copy}>Closing this card starts the {props.resolution?.rightTurnDurationMinutes ?? 40}-minute scale timer. Seekers may turn right or continue straight at street intersections. A U-turn is allowed only after no forward or right option exists for 304 m. The app logs player reports but cannot verify the street layout or route.</Text>
        </View>
      ) : null}

      {unguidedTouristChallenge ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>UNGUIDED TOURIST · STREET VIEW CLUE</Text>
          <Text style={styles.copy}>The hider shares an unzoomed Google Street View image from within 152 m of the seekers’ current location. Keep the horizon level and include a human-built structure. Road, curb, and sidewalk do not count as the structure. Remove this card if Street View coverage is very limited.</Text>
          <Text style={styles.copy}>{props.unguidedTouristHiderAttachmentId ? 'Public Street View clue recorded.' : 'Hider: choose the Street View screenshot from the Card Evidence section below.'}</Text>
          {touristSeekers.map((playerId) => (
            <Text key={playerId} style={styles.metaChip}>{playerId}: {touristConfirmed.includes(playerId) ? 'outside ✓' : 'outside check-in needed'}</Text>
          ))}
          {props.viewerRole === 'seeker' && props.viewerPlayerId && !touristConfirmed.includes(props.viewerPlayerId) ? (
            <AppButton label="I’m outside" disabled={props.disabled || !props.onConfirmUnguidedTouristOutdoors} onPress={() => props.onConfirmUnguidedTouristOutdoors?.()} />
          ) : null}
          {(props.viewerRole === 'hider' || props.viewerRole === 'host') ? (
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: unguidedTouristRulesAttested }} onPress={() => setUnguidedTouristRulesAttested((value) => !value)} style={styles.uTurnCheckboxRow}>
              <View style={[styles.uTurnCheckbox, unguidedTouristRulesAttested ? styles.uTurnCheckboxOn : undefined]}><Text style={styles.uTurnCheck}>{unguidedTouristRulesAttested ? '✓' : ''}</Text></View>
              <Text style={styles.copy}>I confirm this unzoomed Street View image is within 152 m of the seekers, level with the horizon, and shows a human-built structure other than any part of a road.</Text>
            </Pressable>
          ) : null}
          <Text style={styles.copy}>When the hider closes this window, seekers must locate the structure in person without internet research or transportation, then send the hider a photo for approval.</Text>
        </View>
      ) : null}

      {birdGuideChallenge ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>BIRD GUIDE · ONE TAKE</Text>
          <Text style={styles.copy}>Hider: record one continuous video, up to {props.resolution?.birdGuideMaximumDurationMinutes ?? 5} minutes on this scale. A recognizable part of the bird must already be in frame when recording begins. If the bird leaves the frame, stop recording. Seekers later need a bird video at least this long; the hider can request another seeker attempt.</Text>
          <Text style={styles.copy}>{props.birdGuideHiderAttachmentId ? 'Your public camera video is ready to start the challenge.' : 'Record your one Bird Guide video in Card Evidence below.'}</Text>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: birdGuideFrameAttested }} onPress={() => setBirdGuideFrameAttested((value) => !value)} style={styles.uTurnCheckboxRow}>
            <View style={[styles.uTurnCheckbox, birdGuideFrameAttested ? styles.uTurnCheckboxOn : undefined]}><Text style={styles.uTurnCheck}>{birdGuideFrameAttested ? '✓' : ''}</Text></View>
            <Text style={styles.copy}>I confirm a recognizable part of the bird was in frame when my recording started.</Text>
          </Pressable>
          <Text style={styles.copy}>The app records video duration, but players must verify the bird remains in frame and that both videos show a bird.</Text>
        </View>
      ) : null}

      {uTurnChallenge ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>U-TURN TRANSIT CHECK</Text>
          <Text style={styles.copy}>Name the next station the seekers’ current service will actually stop at. Another form of transit must serve that station within {props.resolution?.uTurnAlternateTransitWindowMinutes ?? 'the printed'} minutes. The next stop must be farther from the hider than the seekers’ current position.</Text>
          <TextInput accessibilityLabel="U-Turn next station" onChangeText={setUTurnNextStationName} placeholder="Next actual stop" style={styles.hangmanInput} value={uTurnNextStationName} />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: uTurnPreconditionsConfirmed }} onPress={() => setUTurnPreconditionsConfirmed((value) => !value)} style={styles.uTurnCheckboxRow}>
            <View style={[styles.uTurnCheckbox, uTurnPreconditionsConfirmed ? styles.uTurnCheckboxOn : undefined]}><Text style={styles.uTurnCheck}>{uTurnPreconditionsConfirmed ? '✓' : ''}</Text></View>
            <Text style={styles.copy}>I confirmed the actual next stop, that it is farther from the hider, and that another transit mode serves it within the time window.</Text>
          </Pressable>
          <Text style={styles.copy}>The app tracks the agreed stop and seeker confirmations. Route direction and alternate service availability are hider/referee attestations because the app does not have authoritative live service data.</Text>
        </View>
      ) : null}

      {ransomNoteChallenge ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RANSOM NOTE CASTING COST</Text>
          <Text style={styles.copy}>Before activating the curse, spell “Ransom Note” using printed cut-outs, without using this card. Do not pay the cost if the curse cannot be played.</Text>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: ransomNoteCastingCostConfirmed }} onPress={() => setRansomNoteCastingCostConfirmed((value) => !value)} style={styles.uTurnCheckboxRow}>
            <View style={[styles.uTurnCheckbox, ransomNoteCastingCostConfirmed ? styles.uTurnCheckboxOn : undefined]}><Text style={styles.uTurnCheck}>{ransomNoteCastingCostConfirmed ? '✓' : ''}</Text></View>
            <Text style={styles.copy}>We completed the physical casting cost and can activate the curse.</Text>
          </Pressable>
          <Text style={styles.copy}>After activation, seekers submit a five-word-or-more cut-out question. The hider checks the physical note and approves it before that exact wording is asked.</Text>
        </View>
      ) : null}

      {cairnChallenge ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>CAIRN · HIDER’S ATTEMPT</Text>
          <Text style={styles.copy}>Build your one rock tower attempt. Each added rock must stand for at least five seconds before you add another. After it falls, report the number of rocks that successfully stood five seconds; seekers must build a tower of that height.</Text>
          <TextInput accessibilityLabel="Hider stable cairn height" keyboardType="number-pad" onChangeText={(value) => setCairnTargetHeight(value.replace(/[^0-9]/g, ''))} placeholder="Stable height in rocks" style={styles.hangmanInput} value={cairnTargetHeight} />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: cairnTargetConfirmed }} onPress={() => setCairnTargetConfirmed((value) => !value)} style={styles.uTurnCheckboxRow}>
            <View style={[styles.uTurnCheckbox, cairnTargetConfirmed ? styles.uTurnCheckboxOn : undefined]}><Text style={styles.uTurnCheck}>{cairnTargetConfirmed ? '✓' : ''}</Text></View>
            <Text style={styles.copy}>I confirm my one-attempt tower has fallen, and this is its highest height where every rock stood for five seconds.</Text>
          </Pressable>
          <Text style={styles.copy}>Rocks must be found in nature, not purchased. Both teams disperse their rocks after building. The app records the agreed count; it cannot verify the physical tower.</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Next step</Text>
        <Text style={styles.copy}>{guidance.nextStep}</Text>
        {props.resolveDisabledReason ? (
          <Text style={styles.warning}>{props.resolveDisabledReason}</Text>
        ) : null}
      </View>

      <AppButton
        label={endlessTumbleChallenge ? 'Record the casting roll above' : rightTurnChallenge ? 'Start Route Timer' : 'Close Card Window'}
        onPress={() => props.onResolve(
          questionSelectionRequired ? selectedTemplateIds : [],
          zoologistChallenge && zoologistCategory && props.zoologistHiderAttachmentId
            ? { category: zoologistCategory, hiderAttachmentId: props.zoologistHiderAttachmentId }
            : undefined,
          luxuryCarChallenge && luxuryCarFormValid && props.luxuryCarHiderAttachmentId
            ? {
                hiderAttachmentId: props.luxuryCarHiderAttachmentId,
                description: luxuryCarDescription.trim(),
                productionYear: Number(luxuryCarProductionYear),
                msrpCents: luxuryCarMsrpCents,
                currencyCode: luxuryCarCurrencyCode.trim().toUpperCase()
              }
            : undefined,
          uTurnChallenge && uTurnNextStationName.trim().length >= 2 && uTurnPreconditionsConfirmed
            ? { nextStationName: uTurnNextStationName.trim(), preconditionsConfirmed: true }
            : undefined,
          ransomNoteChallenge && ransomNoteCastingCostConfirmed
            ? { castingCostConfirmed: true }
            : undefined,
          cairnChallenge && Number.isSafeInteger(Number(cairnTargetHeight)) && Number(cairnTargetHeight) >= 1 && cairnTargetConfirmed
            ? { targetHeight: Number(cairnTargetHeight), targetConfirmed: true }
            : undefined,
          unguidedTouristChallenge && unguidedTouristRulesAttested && props.unguidedTouristHiderAttachmentId
            ? { hiderAttachmentId: props.unguidedTouristHiderAttachmentId, rulesAttested: true }
            : undefined,
          birdGuideChallenge && birdGuideFrameAttested && props.birdGuideHiderAttachmentId
            ? { hiderAttachmentId: props.birdGuideHiderAttachmentId, birdPresentAttested: true }
            : undefined
        )}
        disabled={!canSubmit || props.disabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10
  },
  hero: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 18,
    gap: 10,
    padding: 14
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800'
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  headerText: {
    flex: 1,
    gap: 4
  },
  cardName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  section: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 18,
    gap: 8,
    padding: 14
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700'
  },
  copy: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  },
  metaChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  warning: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17
  },
  hangmanWord: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 3,
    textAlign: 'center'
  },
  hangmanInput: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
    minHeight: 50,
    paddingHorizontal: 14,
    textAlign: 'center'
  },
  hangmanLetterInput: { width: 66 },
  hangmanGuessRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  categoryPicker: {
    gap: 8
  },
  categoryList: {
    gap: 6
  },
  categoryGroup: {
    gap: 6
  },
  categoryHeading: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 6
  },
  templateOptionCopy: {
    flex: 1,
    gap: 3
  },
  categoryOption: {
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  categoryOptionSelected: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  categoryLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700'
  },
  categoryLabelSelected: {
    color: colors.accentStrong
  },
  categoryState: {
    color: colors.textMuted,
    fontFamily: 'monospace',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1
  },
  templatePrompt: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15
  },
  uTurnCheckboxRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  uTurnCheckbox: { alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong, borderRadius: 6, borderWidth: 1, height: 24, justifyContent: 'center', width: 24 },
  uTurnCheckboxOn: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  uTurnCheck: { color: colors.accentStrong, fontWeight: '900' },
});
