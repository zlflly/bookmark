/**
 * 离线同步管理器
 * 处理离线操作队列和数据同步
 */

import { offlineStorage, type OfflineOperation } from './indexeddb-storage';
import type { Note } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://bookmarkdb.zlflly.asia';

export interface SyncOptions {
  maxRetries?: number;
  retryDelay?: number;
  batchSize?: number;
  timeout?: number;
}

export interface SyncResult {
  success: boolean;
  syncedOperations: number;
  failedOperations: number;
  errors: Array<{ operationId: string; error: string }>;
}

export interface SyncStatus {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: number | null;
  syncProgress?: {
    current: number;
    total: number;
  };
}

class OfflineSyncManager {
  private syncInProgress = false;
  private syncCallbacks = new Set<(status: SyncStatus) => void>();
  private messageHandlers = new Map<string, (data: any) => void>();

  private readonly defaultOptions: Required<SyncOptions> = {
    maxRetries: 3,
    retryDelay: 1000,
    batchSize: 5,
    timeout: 30000
  };

  constructor() {
    this.initServiceWorkerCommunication();
  }

  /**
   * 初始化与Service Worker的通信
   */
  private initServiceWorkerCommunication(): void {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // 监听Service Worker消息
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, data } = event.data;
      this.handleServiceWorkerMessage(type, data);
    });

    // 注册Service Worker消息处理器
    this.messageHandlers.set('STORE_OFFLINE_OPERATION', this.handleStoreOfflineOperation.bind(this));
    this.messageHandlers.set('SYNC_SUCCESS', this.handleSyncSuccess.bind(this));
    this.messageHandlers.set('SYNC_FAILED', this.handleSyncFailed.bind(this));
  }

  /**
   * 处理Service Worker消息
   */
  private handleServiceWorkerMessage(type: string, data: any): void {
    const handler = this.messageHandlers.get(type);
    if (handler) {
      handler(data);
    }
  }

  /**
   * 处理存储离线操作请求
   */
  private async handleStoreOfflineOperation(operation: any): Promise<void> {
    const offlineOp: OfflineOperation = {
      id: operation.id || Date.now().toString(),
      type: this.getOperationType(operation.method, operation.url),
      method: operation.method,
      url: operation.url,
      data: operation.body ? JSON.parse(operation.body) : null,
      headers: operation.headers,
      timestamp: operation.timestamp || Date.now(),
      retryCount: 0
    };

    await offlineStorage.addOperation(offlineOp);
    this.notifyStatusUpdate();
  }

  /**
   * 处理同步成功
   */
  private async handleSyncSuccess(data: { operationId: string }): Promise<void> {
    await offlineStorage.removeOperation(data.operationId);
    this.notifyStatusUpdate();
  }

  /**
   * 处理同步失败
   */
  private async handleSyncFailed(data: { operationId: string; error: string }): Promise<void> {
    const operation = (await offlineStorage.getPendingOperations())
      .find(op => op.id === data.operationId);
    
    if (operation) {
      const newRetryCount = operation.retryCount + 1;
      if (newRetryCount >= this.defaultOptions.maxRetries) {
        // 达到最大重试次数，移除操作
        await offlineStorage.removeOperation(operation.id);
      } else {
        // 增加重试次数
        await offlineStorage.updateOperationRetryCount(operation.id, newRetryCount);
      }
    }
    
    this.notifyStatusUpdate();
  }

  /**
   * 根据请求方法和URL确定操作类型
   */
  private getOperationType(method: string, url: string): 'create' | 'update' | 'delete' {
    const urlPath = new URL(url).pathname;
    
    if (method === 'POST') return 'create';
    if (method === 'PUT' || method === 'PATCH') return 'update';
    if (method === 'DELETE') return 'delete';
    
    // 默认根据URL路径判断
    if (urlPath.includes('/notes/') && method === 'PUT') return 'update';
    if (urlPath.includes('/notes/') && method === 'DELETE') return 'delete';
    if (urlPath === '/api/notes' && method === 'POST') return 'create';
    
    return 'update'; // 默认
  }

  /**
   * 添加离线操作到队列
   */
  async addOfflineOperation(
    type: 'create' | 'update' | 'delete',
    method: string,
    url: string,
    data?: any,
    headers?: Record<string, string>
  ): Promise<void> {
    const operation: OfflineOperation = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      type,
      method,
      url,
      data,
      headers,
      timestamp: Date.now(),
      retryCount: 0
    };

    await offlineStorage.addOperation(operation);
    this.notifyStatusUpdate();
  }

  /**
   * 手动触发同步
   */
  async sync(options: SyncOptions = {}): Promise<SyncResult> {
    if (this.syncInProgress) {
      throw new Error('Sync already in progress');
    }

    const opts = { ...this.defaultOptions, ...options };
    this.syncInProgress = true;
    
    try {
      this.notifyStatusUpdate();
      
      const operations = await offlineStorage.getPendingOperations();
      if (operations.length === 0) {
        return {
          success: true,
          syncedOperations: 0,
          failedOperations: 0,
          errors: []
        };
      }

      // 分批处理操作
      const batches = this.createBatches(operations, opts.batchSize);
      let syncedCount = 0;
      let failedCount = 0;
      const errors: Array<{ operationId: string; error: string }> = [];

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        
        // 更新进度
        this.notifyStatusUpdate({
          current: i * opts.batchSize + batch.length,
          total: operations.length
        });

        const batchResults = await this.processBatch(batch, opts);
        
        syncedCount += batchResults.synced;
        failedCount += batchResults.failed;
        errors.push(...batchResults.errors);

        // 批次之间的延迟
        if (i < batches.length - 1) {
          await this.delay(opts.retryDelay / 2);
        }
      }

      // 清理失败次数过多的操作
      await offlineStorage.cleanupFailedOperations(opts.maxRetries);

      return {
        success: failedCount === 0,
        syncedOperations: syncedCount,
        failedOperations: failedCount,
        errors
      };

    } finally {
      this.syncInProgress = false;
      this.notifyStatusUpdate();
    }
  }

  /**
   * 创建操作批次
   */
  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * 处理批次操作
   */
  private async processBatch(
    operations: OfflineOperation[], 
    options: Required<SyncOptions>
  ): Promise<{
    synced: number;
    failed: number;
    errors: Array<{ operationId: string; error: string }>;
  }> {
    const results = await Promise.allSettled(
      operations.map(op => this.syncOperation(op, options))
    );

    let synced = 0;
    let failed = 0;
    const errors: Array<{ operationId: string; error: string }> = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        synced++;
      } else {
        failed++;
        const operation = operations[index];
        const error = result.status === 'rejected' 
          ? result.reason.message 
          : result.value.error;
        errors.push({ operationId: operation.id, error });
      }
    });

    return { synced, failed, errors };
  }

  /**
   * 同步单个操作
   */
  private async syncOperation(
    operation: OfflineOperation,
    options: Required<SyncOptions>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout);

      const response = await fetch(`${API_BASE_URL}${operation.url}`, {
        method: operation.method,
        headers: {
          'Content-Type': 'application/json',
          ...operation.headers
        },
        body: operation.data ? JSON.stringify(operation.data) : undefined,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // 同步成功，移除操作
      await offlineStorage.removeOperation(operation.id);
      
      return { success: true };

    } catch (error) {
      // 更新重试次数
      const newRetryCount = operation.retryCount + 1;
      
      if (newRetryCount >= options.maxRetries) {
        // 达到最大重试次数，移除操作
        await offlineStorage.removeOperation(operation.id);
      } else {
        // 增加重试次数
        await offlineStorage.updateOperationRetryCount(operation.id, newRetryCount);
      }

      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * 延迟工具函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取同步状态
   */
  async getSyncStatus(): Promise<SyncStatus> {
    const stats = await offlineStorage.getSyncStats();
    
    return {
      isSyncing: this.syncInProgress,
      pendingCount: stats.pendingOperations,
      lastSyncTime: stats.lastSync
    };
  }

  /**
   * 订阅同步状态更新
   */
  onStatusUpdate(callback: (status: SyncStatus) => void): () => void {
    this.syncCallbacks.add(callback);
    
    // 立即发送当前状态
    this.getSyncStatus().then(callback);
    
    // 返回取消订阅函数
    return () => {
      this.syncCallbacks.delete(callback);
    };
  }

  /**
   * 通知状态更新
   */
  private async notifyStatusUpdate(progress?: { current: number; total: number }): Promise<void> {
    if (this.syncCallbacks.size === 0) return;

    const status = await this.getSyncStatus();
    if (progress) {
      status.syncProgress = progress;
    }

    this.syncCallbacks.forEach(callback => {
      try {
        callback(status);
      } catch (error) {
        console.error('Error in sync status callback:', error);
      }
    });
  }

  /**
   * 自动同步（当网络恢复时）
   */
  async autoSync(): Promise<void> {
    if (this.syncInProgress) return;

    const needsSync = await offlineStorage.needsSync();
    if (!needsSync) return;

    try {
      console.log('Starting auto sync...');
      const result = await this.sync();
      console.log('Auto sync completed:', result);
    } catch (error) {
      console.error('Auto sync failed:', error);
    }
  }

  /**
   * 清理过期的离线操作
   */
  async cleanupOldOperations(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    const operations = await offlineStorage.getPendingOperations();
    const now = Date.now();
    
    const oldOperations = operations.filter(op => 
      now - op.timestamp > maxAge
    );

    for (const operation of oldOperations) {
      await offlineStorage.removeOperation(operation.id);
    }

    if (oldOperations.length > 0) {
      console.log(`Cleaned up ${oldOperations.length} old offline operations`);
      this.notifyStatusUpdate();
    }
  }

  /**
   * 获取同步统计信息
   */
  async getStats(): Promise<{
    pendingOperations: number;
    totalStorageSize: {
      notes: number;
      operations: number;
      cache: number;
      metadata: number;
    };
    lastSyncTime: number | null;
  }> {
    const [syncStats, storageStats] = await Promise.all([
      offlineStorage.getSyncStats(),
      offlineStorage.getStats()
    ]);

    return {
      pendingOperations: syncStats.pendingOperations,
      totalStorageSize: storageStats,
      lastSyncTime: syncStats.lastSync
    };
  }
}

// 创建单例实例
export const offlineSync = new OfflineSyncManager();

// React Hook for sync status
import { useState, useEffect } from 'react';

export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>({
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null
  });

  useEffect(() => {
    const unsubscribe = offlineSync.onStatusUpdate(setStatus);
    return unsubscribe;
  }, []);

  return {
    ...status,
    sync: () => offlineSync.sync(),
    autoSync: () => offlineSync.autoSync()
  };
}