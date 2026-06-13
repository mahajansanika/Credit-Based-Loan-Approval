import mongoose from 'mongoose';

const ApplicantSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Applicant' },
    inputs: {
      monthly_income: Number,
      monthly_expense: Number,
      existing_loans: Number,
      credit_history_months: Number,
      defaults: Number,
    },
    derivedFields: {
      dti: Number,
      affordability_buffer: Number,
    },
    result: { type: mongoose.Schema.Types.Mixed },
    configName: { type: String, default: 'Default Policy v1' },
  },
  { timestamps: true }
);

export default mongoose.model('Applicant', ApplicantSchema);
