#!/usr/bin/env node
/**
 * Verify real Axelar vote txs against parsing rules.
 * Usage: node fixtures/evm/verify-real-tx.mjs
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

const VOTE_EVENTS_TYPE = '/axelar.evm.v1beta1.VoteEvents';
const VOTE_NO_EVENTS_TYPE = '/axelar.evm.v1beta1.VoteNoEvents';

function classifyEvmVote(vote) {
  if (!vote || typeof vote !== 'object' || !vote['@type']) return null;
  const voteType = vote['@type'];
  const chain = vote.chain !== undefined ? String(vote.chain) : undefined;
  if (voteType === VOTE_NO_EVENTS_TYPE) return { status: 'invalid', chain };
  if (voteType === VOTE_EVENTS_TYPE) {
    if (Array.isArray(vote.events)) {
      return { status: vote.events.length > 0 ? 'validated' : 'invalid', chain };
    }
    return { status: 'validated', chain };
  }
  return null;
}

function extractVotePayload(message) {
  const msgType = message['@type'];
  if (msgType === '/axelar.reward.v1beta1.RefundMsgRequest' && message.inner_message) {
    const inner = message.inner_message;
    if ('poll_id' in inner) {
      return { pollId: String(inner.poll_id), vote: inner.vote ?? null, innerType: inner['@type'] };
    }
  }
  if (msgType === '/axelar.vote.v1beta1.VoteRequest' && 'poll_id' in message) {
    return { pollId: String(message.poll_id), vote: message.vote ?? null, innerType: msgType };
  }
  return null;
}

function collectRefundVotes(messages) {
  const results = [];
  for (const message of messages) {
    if (message['@type'] === '/axelar.auxiliary.v1beta1.BatchRequest' && message.messages) {
      results.push(...collectRefundVotes(message.messages));
      continue;
    }
    const payload = extractVotePayload(message);
    if (payload) {
      results.push({
        ...payload,
        classification: classifyEvmVote(payload.vote),
      });
    }
  }
  return results;
}

async function verifyFile(filename) {
  const raw = (await readFile(join(dir, filename), 'utf8')).replace(/^\uFEFF/, '');
  const data = JSON.parse(raw);
  const messages = data.tx?.body?.messages ?? [];
  const votes = collectRefundVotes(messages);
  console.log(`\n${filename}: ${votes.length} vote(s) found`);
  for (const v of votes.slice(0, 5)) {
    console.log(
      `  poll ${v.pollId} | inner ${v.innerType} | chain ${v.classification?.chain} | → ${v.classification?.status ?? 'UNSUPPORTED'}`
    );
  }
  if (votes.length > 5) {
    console.log(`  ... and ${votes.length - 5} more`);
  }
  return votes;
}

const voteTx = await verifyFile('api-tx-single-vote-ethereum-3171848.json');
const batchTx3171843 = await verifyFile('api-tx-batch-vote-base-3171843.json');
const batchTx3171884 = await verifyFile('api-tx-batch-vote-base-3171884.json');

const poll3171848 = voteTx.find((v) => v.pollId === '3171848');
if (poll3171848?.classification?.status === 'validated') {
  console.log('\n✅ Poll 3171848 vote tx → validated (matches Axelarscan)');
} else {
  console.log('\n❌ Poll 3171848 classification failed');
  process.exit(1);
}

if (batchTx3171843.length === 4 && batchTx3171884.length === 5) {
  console.log('✅ Batch vote fixtures parsed (4 + 5 votes)');
} else {
  console.log('❌ Batch vote count mismatch');
  process.exit(1);
}

const voteNoTx = await verifyFile('api-tx-vote-no-empty-events-3172140.json');
const poll3172140 = voteNoTx.find((v) => v.pollId === '3172140');
if (poll3172140?.classification?.status === 'invalid') {
  console.log('✅ Poll 3172140 vote-no tx → invalid (VoteEvents with events:[])');
} else {
  console.log('❌ Poll 3172140 vote-no classification failed');
  process.exit(1);
}

console.log('\nOld heuristic (type/event_id) would have failed on real events:');
const ev = poll3171848.vote?.events?.[0];
console.log(`  has type: ${'type' in ev} | has event_id: ${'event_id' in ev} | has contract_call: ${'contract_call' in ev}`);
