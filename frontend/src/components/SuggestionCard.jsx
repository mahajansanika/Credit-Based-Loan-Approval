/**
 * One conditional-resolution suggestion: change description, projected score
 * and stats, interaction rules still firing, full quantified reason, and a
 * "Try in simulator" shortcut.
 */
export default function SuggestionCard({ suggestion, rank, onTry }) {
  return (
    <div className="border border-slate-200 rounded-lg p-4 bg-white">
      <div className="flex items-start gap-3">
        <span className="w-7 h-7 shrink-0 rounded-full bg-indigo-100 text-indigo-700 grid place-items-center text-sm font-bold">
          {rank}
        </span>
        <div className="flex-1">
          <p className="font-medium text-slate-800">{suggestion.changeDescription}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-center">
            <div className="bg-slate-50 rounded p-2">
              <p className="text-xs text-slate-500">New score</p>
              <p className="font-bold text-emerald-600 tabular-nums">{suggestion.newScore}</p>
            </div>
            <div className="bg-slate-50 rounded p-2">
              <p className="text-xs text-slate-500">Gain</p>
              <p className="font-bold tabular-nums">+{suggestion.pointsGained}</p>
            </div>
            <div className="bg-slate-50 rounded p-2">
              <p className="text-xs text-slate-500">New DTI</p>
              <p className="font-bold tabular-nums">{suggestion.newDTI}</p>
            </div>
            <div className="bg-slate-50 rounded p-2">
              <p className="text-xs text-slate-500">New buffer</p>
              <p className="font-bold tabular-nums">{suggestion.newAffordBuffer}</p>
            </div>
          </div>
          {suggestion.interactionRulesStillFired.length > 0 && (
            <p className="mt-2 text-xs text-amber-600">
              Still triggers: {suggestion.interactionRulesStillFired.join(', ')}
            </p>
          )}
          <p className="mt-2 text-sm text-slate-600">{suggestion.reason}</p>
          {onTry && (
            <button className="btn-secondary text-xs mt-3" onClick={() => onTry(suggestion.changes)}>
              Try in simulator ↓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
