/**
 * Data access layer. Uses MongoDB via Mongoose when connected; otherwise a
 * transparent in-memory store, so every feature works without a database
 * (data simply does not survive a restart).
 */
import { randomUUID } from 'node:crypto';
import { isDbConnected } from '../config/db.js';
import Applicant from '../models/Applicant.js';
import RuleConfig from '../models/RuleConfig.js';
import Portfolio from '../models/Portfolio.js';

const memory = {
  applicants: new Map(),
  configs: new Map(),
  portfolios: new Map(),
};

/** @returns {string} ISO timestamp for in-memory records */
function now() {
  return new Date().toISOString();
}

// ---------- Applicants ----------

export async function saveApplicant(data) {
  if (isDbConnected()) {
    const doc = await Applicant.create(data);
    return doc.toObject();
  }
  const record = { _id: randomUUID(), ...data, createdAt: now(), updatedAt: now() };
  memory.applicants.set(record._id, record);
  return record;
}

export async function getApplicantById(id) {
  if (isDbConnected()) {
    try {
      const doc = await Applicant.findById(id).lean();
      return doc ?? null;
    } catch {
      return null; // invalid ObjectId cast
    }
  }
  return memory.applicants.get(id) ?? null;
}

export async function listApplicants() {
  if (isDbConnected()) {
    return Applicant.find().sort({ createdAt: -1 }).lean();
  }
  return [...memory.applicants.values()].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

// ---------- Rule configs ----------

export async function listRuleConfigs() {
  if (isDbConnected()) {
    return RuleConfig.find().sort({ createdAt: -1 }).lean();
  }
  return [...memory.configs.values()].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

export async function getRuleConfigById(id) {
  if (isDbConnected()) {
    try {
      return (await RuleConfig.findById(id).lean()) ?? null;
    } catch {
      return null;
    }
  }
  return memory.configs.get(id) ?? null;
}

export async function getActiveRuleConfig() {
  if (isDbConnected()) {
    return RuleConfig.findOne({ isActive: true }).lean();
  }
  return [...memory.configs.values()].find((c) => c.isActive) ?? null;
}

export async function saveRuleConfig({ name, config }) {
  if (isDbConnected()) {
    const doc = await RuleConfig.create({ name, config, isActive: false });
    return doc.toObject();
  }
  const record = { _id: randomUUID(), name, config, isActive: false, createdAt: now(), updatedAt: now() };
  memory.configs.set(record._id, record);
  return record;
}

export async function updateRuleConfig(id, { name, config }) {
  if (isDbConnected()) {
    try {
      return (
        (await RuleConfig.findByIdAndUpdate(id, { name, config }, { new: true }).lean()) ?? null
      );
    } catch {
      return null;
    }
  }
  const record = memory.configs.get(id);
  if (!record) return null;
  Object.assign(record, { name: name ?? record.name, config: config ?? record.config, updatedAt: now() });
  return record;
}

export async function activateRuleConfig(id) {
  if (isDbConnected()) {
    try {
      await RuleConfig.updateMany({}, { isActive: false });
      return (await RuleConfig.findByIdAndUpdate(id, { isActive: true }, { new: true }).lean()) ?? null;
    } catch {
      return null;
    }
  }
  if (!memory.configs.has(id)) return null;
  for (const c of memory.configs.values()) c.isActive = false;
  const record = memory.configs.get(id);
  record.isActive = true;
  return record;
}

export async function deleteRuleConfig(id) {
  if (isDbConnected()) {
    try {
      const res = await RuleConfig.findByIdAndDelete(id).lean();
      return res !== null;
    } catch {
      return false;
    }
  }
  return memory.configs.delete(id);
}

// ---------- Portfolios (batch records) ----------

export async function savePortfolioBatch({ name, applicantIds, summary }) {
  if (isDbConnected()) {
    const doc = await Portfolio.create({ name, applicantIds, summary });
    return doc.toObject();
  }
  const record = { _id: randomUUID(), name, applicantIds, summary, createdAt: now(), updatedAt: now() };
  memory.portfolios.set(record._id, record);
  return record;
}

export async function listPortfolios() {
  if (isDbConnected()) {
    return Portfolio.find().sort({ createdAt: -1 }).lean();
  }
  return [...memory.portfolios.values()].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}
