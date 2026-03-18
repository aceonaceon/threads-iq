interface PostInputProps {
  index: number;
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export default function PostInput({ index, value, onChange, onRemove, canRemove }: PostInputProps) {
  const maxLength = 500;

  return (
    <div className="relative group">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface flex items-center justify-center text-sm font-medium text-gray-400">
          {index + 1}
        </div>
        <div className="flex-1">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
            placeholder={`貼上第 ${index + 1} 篇 Threads 貼文...`}
            className="w-full min-h-[100px] bg-surface border border-white/10 rounded-xl p-4 text-white placeholder-gray-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-colors resize-none"
            maxLength={maxLength}
          />
          <div className="flex items-center justify-between mt-2">
            <span className={`text-xs ${value.length > maxLength * 0.9 ? 'text-orange-400' : 'text-gray-600'}`}>
              {value.length} / {maxLength}
            </span>
            {canRemove && (
              <button
                onClick={onRemove}
                className="text-gray-600 hover:text-red-400 transition-colors p-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
