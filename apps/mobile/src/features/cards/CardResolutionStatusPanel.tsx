import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { MatchProjection, MatchRole, QuestionCategoryDefinition, QuestionTemplateDefinition, ScaleKey } from '../../../../../packages/shared-types/src/index.ts';
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
  onResolve: (questionTemplateIds: string[]) => void;
}

export function CardResolutionStatusPanel(props: CardResolutionStatusPanelProps) {
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [hangmanWord, setHangmanWord] = useState('');
  const [hangmanLetter, setHangmanLetter] = useState('');
  useEffect(() => {
    setSelectedTemplateIds([]);
    setHangmanWord('');
    setHangmanLetter('');
  }, [props.resolution?.sourceCardInstanceId]);
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
  const hangman = props.resolution?.hangman;
  const requiredQuestionCount = props.resolution?.questionTemplateCount ?? 0;
  const canSubmit = props.canResolve &&
    (!questionSelectionRequired || selectedTemplateIds.length === requiredQuestionCount) &&
    (!hangmanChallenge || hangman?.status === 'solved' || hangman?.status === 'ended');

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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Next step</Text>
        <Text style={styles.copy}>{guidance.nextStep}</Text>
        {props.resolveDisabledReason ? (
          <Text style={styles.warning}>{props.resolveDisabledReason}</Text>
        ) : null}
      </View>

      <AppButton
        label="Close Card Window"
        onPress={() => props.onResolve(questionSelectionRequired ? selectedTemplateIds : [])}
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
});
