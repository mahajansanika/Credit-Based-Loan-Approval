import mongoose from 'mongoose';

const RuleConfigSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    config: { type: mongoose.Schema.Types.Mixed, required: true },
    isActive: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('RuleConfig', RuleConfigSchema);
