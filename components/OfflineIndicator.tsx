"use client"

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNetworkStatus } from '@/lib/hooks/use-network-status';
import { cn } from '@/lib/utils';

interface OfflineIndicatorProps {
  className?: string;
}

export default function OfflineIndicator({
  className,
}: OfflineIndicatorProps) {
  const {
    isOnline,
    retryConnection,
    isRetrying
  } = useNetworkStatus();

  // 只在离线时显示提示
  if (isOnline) {
    return null;
  }

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={cn(
            "fixed top-4 left-1/2 transform -translate-x-1/2 z-50",
            "max-w-md w-full mx-4",
            className
          )}
        >
          <div
            className={cn(
              "rounded-lg border shadow-lg backdrop-blur-sm",
              "px-4 py-3 flex items-center gap-3",
              "bg-red-50/90 border-red-200 text-red-800"
            )}
          >
            {/* 状态图标 */}
            <div className="flex-shrink-0">
              <WifiOff className="h-5 w-5 text-red-600" />
            </div>

            {/* 状态信息 */}
            <div className="flex-1 min-w-0">
              <div className="font-medium">
                离线模式
              </div>

              <div className="text-sm opacity-90 mt-1">
                您可以查看已缓存的内容，新操作将在连网后同步
              </div>
            </div>

            {/* 重试按钮 */}
            <Button
              variant="outline"
              size="sm"
              onClick={retryConnection}
              disabled={isRetrying}
              className={cn(
                "flex-shrink-0",
                "border-red-200 text-red-700 hover:bg-red-100",
                isRetrying && "opacity-50"
              )}
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  isRetrying && "animate-spin"
                )}
              />
              <span className="ml-2">
                {isRetrying ? "检测中..." : "重试"}
              </span>
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// 简化版离线指示器（用于状态栏）
export function OfflineStatusBadge({ className }: { className?: string }) {
  const { isOnline } = useNetworkStatus();

  if (isOnline) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
        "bg-red-100 text-red-800 border border-red-200",
        className
      )}
    >
      <WifiOff className="h-3 w-3" />
      <span>离线</span>
    </motion.div>
  );
}