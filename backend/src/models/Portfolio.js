import mongoose from 'mongoose';

const PortfolioSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Batch' },
    applicantIds: [{ type: mongoose.Schema.Types.Mixed }],
    summary: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

export default mongoose.model('Portfolio', PortfolioSchema);
