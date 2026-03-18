interface TopicSuggestionsProps {
  suggestions: string[];
}

export default function TopicSuggestions({ suggestions }: TopicSuggestionsProps) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="bg-surface rounded-xl p-6 animate-fade-in">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <span className="text-xl">💡</span>
        下一po建議
      </h3>
      <ul className="space-y-3">
        {suggestions.map((suggestion, idx) => (
          <li key={idx} className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-accent/20 text-accent text-sm font-medium flex items-center justify-center">
              {idx + 1}
            </span>
            <span className="text-gray-300">{suggestion}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
