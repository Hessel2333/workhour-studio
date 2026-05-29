import { useEffect } from 'react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
}

export default function Toast({ message, type = 'info', onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);

    return () => clearTimeout(timer);
  }, [onClose]);

  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return 'bg-gradient-to-r from-[#34D399]/90 to-[#3B82F6]/90';
      case 'error':
        return 'bg-gradient-to-r from-[#EF4444]/90 to-[#B91C1C]/90';
      default:
        return 'bg-gradient-to-r from-[#3B82F6]/90 to-[#1D4ED8]/90';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M20 6L9 17l-5-5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M6 18L18 6M6 6l12 12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );
    }
  };

  return (
    <div className="fixed bottom-6 left-6 z-50 animate-slideInFromBottom">
      <div className={`${getBackgroundColor()} backdrop-blur-sm rounded-xl py-3 px-4 text-white shadow-lg flex items-center gap-3 min-w-[300px] max-w-[500px]`}>
        <div className="shrink-0">
          {getIcon()}
        </div>
        <p className="text-[14px] font-medium flex-1">{message}</p>
      </div>
    </div>
  );
} 