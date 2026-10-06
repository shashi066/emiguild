import type { AssistantStreamEvent } from '@/types/assistant';

export class AssistantEventParser {
  private buffer = '';
  push(chunk: string): AssistantStreamEvent[] {
    this.buffer += chunk;
    const frames = this.buffer.split(/\r?\n\r?\n/);
    this.buffer = frames.pop() ?? '';
    return frames.flatMap((frame) => {
      const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
      return data ? [JSON.parse(data) as AssistantStreamEvent] : [];
    });
  }
}
