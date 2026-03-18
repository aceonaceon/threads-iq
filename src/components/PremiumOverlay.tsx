import { useAuth } from '../lib/auth';

interface PremiumOverlayProps {
  featureName: string;
  requiredPlan: 'creator' | 'pro';
}

/**
 * Premium overlay component that shows a blur and CTA for free users
 * to encourage upgrading to a paid plan
 */
export default function PremiumOverlay({ featureName }: PremiumOverlayProps) {
  const { user } = useAuth();
  
  // For now, since there's no Stripe yet, show overlay for all authenticated users
  // Once paid plans exist, check: (user as any)?.plan !== 'creator' && (user as any)?.plan !== 'pro'
  const showOverlay = !user;

  if (!showOverlay) {
    return null;
  }

  return (
    <div className="relative">
      {/* Actual content underneath (rendered but blurred) */}
      
      {/* Blur overlay */}
      <div 
        className="fixed inset-0 z-40 pointer-events-none"
        style={{
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(4px)',
        }}
      />
      
      {/* CTA Card - positioned in center of viewport */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
          className="bg-gray-900 border border-gray-700 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl animate-fade-in"
          style={{
            animation: 'fadeIn 0.3s ease-out',
          }}
        >
          {/* Icon */}
          <div className="text-5xl mb-4">🔒</div>
          
          {/* Title */}
          <h2 className="text-2xl font-bold text-white mb-2">
            進階會員功能
          </h2>
          
          {/* Description */}
          <p className="text-gray-400 mb-4">
            升級進階會員即可解鎖此功能
          </p>
          
          {/* Feature name */}
          <div className="bg-gray-800/50 rounded-lg px-4 py-3 mb-6">
            <span className="text-accent font-medium">{featureName}</span>
          </div>
          
          {/* CTA Button */}
          <a
            href="/#pricing"
            className="inline-block w-full py-3 bg-[#E85D04] hover:bg-[#F97316] text-white font-semibold rounded-xl transition-colors mb-4"
          >
            了解方案 →
          </a>
          
          {/* Secondary text */}
          <p className="text-gray-500 text-sm">
            目前開發中，敬請期待
          </p>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
