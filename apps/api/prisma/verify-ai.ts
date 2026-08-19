/**
 * Exercises VideoHub AI against the live API with the mock provider.
 *
 * Checks that the assistant recommends only from the real catalogue, that its
 * recommendations resolve to linkable records, that conversations persist and
 * stay private to their owner, and that SSE streaming actually streams.
 *
 *   npm run db:verify:ai --workspace=@videohub/api
 */
import { PrismaClient } from '@prisma/client';

const BASE = 'http://localhost:3000/api';
const prisma = new PrismaClient();

interface Reply {
  status: number;
  json: { success?: boolean; code?: string; data?: any } | null;
}

async function call(
  method: string,
  path: string,
  { token, body }: { token?: string; body?: unknown } = {},
): Promise<Reply> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, json: (await res.json().catch(() => null)) as Reply['json'] };
}

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

async function main(): Promise<void> {
  console.log('Verifying VideoHub AI against the live API…\n');

  const stamp = Date.now();
  const email = `ai-${stamp}@verify.local`;
  const reg = await call('POST', '/auth/register', {
    body: { email, password: 'AiTest12345', displayName: 'AI Verifier' },
  });
  const token: string = reg.json!.data.accessToken;

  const catalogue = await prisma.movie.findMany({
    where: { isPublished: true },
    select: { title: true },
  });
  const knownTitles = new Set(catalogue.map((m) => m.title.toLowerCase()));

  console.log('auth');
  const anon = await call('POST', '/ai/chat', { body: { message: 'hello' } });
  check('chat requires an account', anon.status === 401);

  console.log('\nchat');
  const reply = await call('POST', '/ai/chat', {
    token,
    body: { message: 'Recommend me a good comedy' },
  });
  check('a reply is returned', reply.status === 201 || reply.status === 200, `${reply.status}`);
  check('the reply has content', (reply.json?.data?.message?.content?.length ?? 0) > 20);
  check('a conversation id is returned', typeof reply.json?.data?.conversationId === 'string');

  const content: string = reply.json!.data.message.content;
  const mentioned = [...content.matchAll(/\*\*(.+?)\*\*/g)]
    .map((m) => m[1]!.replace(/\s*\(\d{4}\)\s*$/, '').trim().toLowerCase());

  check(
    'every title it names exists in the catalogue',
    mentioned.length > 0 && mentioned.every((title) => knownTitles.has(title)),
    `${mentioned.length} titles`,
  );

  const recommendations = reply.json!.data.message.recommendations;
  check(
    'recommendations resolve to real records with ids',
    Array.isArray(recommendations) &&
      recommendations.length > 0 &&
      recommendations.every((r: { movieId: string | null }) => typeof r.movieId === 'string'),
    `${recommendations.length} resolved`,
  );
  check(
    'every recommendation carries a reason',
    recommendations.every((r: { reason: string }) => r.reason.length > 5),
  );

  console.log('\nconversation persistence');
  const conversationId: string = reply.json!.data.conversationId;

  const followUp = await call('POST', '/ai/chat', {
    token,
    body: { message: 'Something scarier instead', conversationId },
  });
  check('a follow-up continues the same conversation', followUp.json?.data?.conversationId === conversationId);

  const fetched = await call('GET', `/ai/conversations/${conversationId}`, { token });
  check(
    'the conversation stores both turns',
    fetched.json?.data?.messages?.length === 4,
    `${fetched.json?.data?.messages?.length} messages`,
  );
  check(
    'roles alternate user/assistant',
    fetched.json?.data?.messages?.map((m: { role: string }) => m.role).join(',') ===
      'USER,ASSISTANT,USER,ASSISTANT',
  );

  const list = await call('GET', '/ai/conversations', { token });
  check('the conversation appears in the list', list.json?.data?.length === 1);
  check(
    'the conversation is titled from the first message',
    typeof list.json?.data?.[0]?.title === 'string' && list.json.data[0].title.length > 0,
    list.json?.data?.[0]?.title,
  );

  console.log('\nprivacy');
  const other = await call('POST', '/auth/register', {
    body: { email: `ai-other-${stamp}@verify.local`, password: 'AiTest12345', displayName: 'Other' },
  });
  const otherToken: string = other.json!.data.accessToken;

  const foreign = await call('GET', `/ai/conversations/${conversationId}`, { token: otherToken });
  check('another user cannot read the conversation', foreign.status === 404, foreign.json?.code);

  const foreignDelete = await call('DELETE', `/ai/conversations/${conversationId}`, {
    token: otherToken,
  });
  check('another user cannot delete it', foreignDelete.status === 404);

  console.log('\nvalidation');
  const empty = await call('POST', '/ai/chat', { token, body: { message: '   ' } });
  check('an empty message is rejected', empty.status === 400, empty.json?.code);

  const tooLong = await call('POST', '/ai/chat', { token, body: { message: 'x'.repeat(5000) } });
  check('an over-long message is rejected', tooLong.status === 400, tooLong.json?.code);

  const ghost = await call('POST', '/ai/chat', {
    token,
    body: { message: 'hi', conversationId: 'does-not-exist' },
  });
  check('an unknown conversation id 404s', ghost.status === 404, ghost.json?.code);

  console.log('\nstreaming (SSE)');
  const streamRes = await fetch(`${BASE}/ai/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message: 'Recommend a sci-fi film' }),
  });

  check('the stream responds with an SSE content type',
    streamRes.headers.get('content-type')?.includes('text/event-stream') === true,
    streamRes.headers.get('content-type') ?? '');

  const reader = streamRes.body!.getReader();
  const decoder = new TextDecoder();
  const events: string[] = [];
  let buffer = '';
  let tokenCount = 0;
  let doneMessage: any = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      const event = JSON.parse(line.slice(5).trim());
      events.push(event.type);
      if (event.type === 'token') tokenCount += 1;
      if (event.type === 'done') doneMessage = event.message;
    }
  }

  check('the first event announces the conversation', events[0] === 'conversation');
  check('tokens arrive incrementally', tokenCount > 5, `${tokenCount} tokens`);
  check('the last event is done', events[events.length - 1] === 'done');
  check('the streamed message is persisted with recommendations',
    typeof doneMessage?.id === 'string' && Array.isArray(doneMessage?.recommendations),
    `${doneMessage?.recommendations?.length} recommendations`);

  console.log('\nrecommendation engine (no AI call)');
  const guestRecs = await call('GET', '/ai/recommendations');
  check('guests get recommendations', (guestRecs.json?.data?.length ?? 0) > 0, `${guestRecs.json?.data?.length}`);
  check('each carries a reason and a source',
    guestRecs.json!.data.every((r: { reason: string; source: string }) => r.reason.length > 0 && r.source.length > 0));

  const userRecs = await call('GET', '/ai/recommendations', { token });
  check('signed-in users get recommendations', (userRecs.json?.data?.length ?? 0) > 0);

  console.log('\ncleanup');
  const removed = await call('DELETE', `/ai/conversations/${conversationId}`, { token });
  check('the owner can delete their conversation', removed.status === 200);

  await prisma.user.deleteMany({ where: { email: { contains: `-${stamp}@verify.local` } } });

  console.log(`\n${passed}/${passed + failed} checks passed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error('AI verification error:', error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
