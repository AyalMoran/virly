// server/src/repositories/mongo/communicationProfile.repository.ts
import { CommunicationProfileModel } from "../../models/CommunicationProfile.js";
import type { CommunicationProfileRecord, CommunicationProfileRepository } from "../types.js";

type Lean = Omit<CommunicationProfileRecord, "id" | "userId"> & { _id: unknown; userId: unknown };

function toRecord(d: Lean): CommunicationProfileRecord {
  return {
    id: String(d._id), userId: String(d.userId),
    formality: d.formality ?? null, verbosity: d.verbosity ?? null, complexity: d.complexity ?? null,
    humor: d.humor ?? null, pace: d.pace ?? null, memory: d.memory ?? "",
    createdAt: d.createdAt, updatedAt: d.updatedAt,
  };
}

export const mongoCommunicationProfileRepository: CommunicationProfileRepository = {
  async findByUserId(userId) {
    const d = await CommunicationProfileModel.findOne({ userId }).lean<Lean>().exec();
    return d ? toRecord(d) : null;
  },
  async save(userId, profile) {
    const d = await CommunicationProfileModel.findOneAndUpdate(
      { userId }, { $set: { ...profile, userId } }, { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean<Lean>().exec();
    return toRecord(d as Lean);
  },
  async deleteByUserId(userId) {
    await CommunicationProfileModel.deleteOne({ userId }).exec();
  },
};
