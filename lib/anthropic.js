import Anthropic from '@anthropic-ai/sdk';

// ⚠️ SERVER-ONLY. Each position has its own Claude key (so usage/learning is per-role and rolls up
// to GM/Owner). Roles without a dedicated key fall back to the nearest related one; unknown → owner.
const ROLE_ENV = {
  owner: 'ANTHROPIC_KEY_OWNER', admin: 'ANTHROPIC_KEY_OWNER',
  gm: 'ANTHROPIC_KEY_GM', fs: 'ANTHROPIC_KEY_GM',          // FS reports up to GM
  office: 'ANTHROPIC_KEY_OFFICE', csr: 'ANTHROPIC_KEY_OFFICE', dispatcher: 'ANTHROPIC_KEY_OFFICE',
  om: 'ANTHROPIC_KEY_OFFICE', shop: 'ANTHROPIC_KEY_OFFICE', viewer: 'ANTHROPIC_KEY_OWNER',
  accounting: 'ANTHROPIC_KEY_ACCOUNTING',
  sales: 'ANTHROPIC_KEY_SALES',
  marketing: 'ANTHROPIC_KEY_MARKETING',
  tech: 'ANTHROPIC_KEY_TECH', foreman: 'ANTHROPIC_KEY_TECH',
  helper: 'ANTHROPIC_KEY_HELPER',
};

// Current best model. Cost is tuned via `effort`, not by downgrading the model.
export const AI_MODEL = 'claude-opus-4-8';

export function keyForRole(role) {
  const r = String(role || '').toLowerCase();
  const name = ROLE_ENV[r] || 'ANTHROPIC_KEY_OWNER';
  return process.env[name] || process.env.ANTHROPIC_KEY_OWNER || process.env.ANTHROPIC_API_KEY || '';
}

export function isAiConfigured(role) { return !!keyForRole(role); }

export function getAnthropic(role) {
  const apiKey = keyForRole(role);
  return apiKey ? new Anthropic({ apiKey }) : null;
}
