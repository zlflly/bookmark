/**
 * 网络状态检测Hook
 * 监听网络连接状态和提供离线功能
 */

import { useState, useEffect, useCallback } from 'react';

export interface NetworkStatus {
  isOnline: boolean;
}

export interface UseNetworkStatusReturn extends NetworkStatus {
  retryConnection: () => void;
  isRetrying: boolean;
}

export function useNetworkStatus(): UseNetworkStatusReturn {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  });

  const [isRetrying, setIsRetrying] = useState(false);

  // 处理在线状态变化
  const handleOnline = useCallback(() => {
    setNetworkStatus(prev => ({ ...prev, isOnline: true }));
  }, []);

  const handleOffline = useCallback(() => {
    setNetworkStatus(prev => ({ ...prev, isOnline: false }));
  }, []);

  // 重试连接
  const retryConnection = useCallback(async () => {
    if (isRetrying) return;

    setIsRetrying(true);

    try {
      const response = await fetch('/favicon.png', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        handleOnline();
      }
    } catch (error) {
      console.log('Network still unavailable:', error);
    } finally {
      setIsRetrying(false);
    }
  }, [isRetrying, handleOnline]);

  useEffect(() => {
    // 监听网络状态变化
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  return {
    ...networkStatus,
    retryConnection,
    isRetrying
  };
}