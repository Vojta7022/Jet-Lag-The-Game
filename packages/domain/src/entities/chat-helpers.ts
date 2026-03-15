import type {
  AttachmentModel,
  ChatChannelModel,
  ChatMessageModel,
  MatchAggregate
} from '../../../shared-types/src/index.ts';

export function getChatChannel(
  aggregate: MatchAggregate,
  channelId: string | undefined
): ChatChannelModel | undefined {
  if (!channelId) {
    return undefined;
  }

  return aggregate.chatChannels[channelId];
}

export function getChatMessagesForChannel(
  aggregate: MatchAggregate,
  channelId: string | undefined
): ChatMessageModel[] {
  if (!channelId) {
    return [];
  }

  return Object.values(aggregate.chatMessages)
    .filter((message) => message.channelId === channelId)
    .sort((left, right) => left.sentAt.localeCompare(right.sentAt));
}

export function getAttachment(
  aggregate: MatchAggregate,
  attachmentId: string | undefined
): AttachmentModel | undefined {
  if (!attachmentId) {
    return undefined;
  }

  return aggregate.attachments[attachmentId];
}
