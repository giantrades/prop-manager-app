import React, { useEffect } from 'react';
import { getPlatformManager } from '@apps/utils/platformManager';
import { getPlatformSettings, getAll } from '@apps/lib/dataStore';

export function PlatformProvider({ children }) {
  useEffect(() => {
    // Initialize PlatformManager at app root level
    const pm = getPlatformManager();
    
    // Configure adapters from stored settings
    const qtSettings = getPlatformSettings('quantower');
    if (qtSettings?.bridgeUrl) {
      const qtAdapter = pm.getAdapter('quantower');
      if (qtAdapter) qtAdapter.setBridgeUrl(qtSettings.bridgeUrl);
    }

    // Auto-start if any platform is enabled (autoSync not required — fixes
    // bug where autoSync was never saved in legacy settings)
    const timer = setTimeout(() => {
      const allData = getAll();
      const platforms = allData.settings?.platforms || {};
      const shouldAutoStart = Object.values(platforms).some(p => p.enabled);
      console.log(`[PlatformProvider] shouldAutoStart=${shouldAutoStart}`, Object.entries(platforms).map(([k,v]) => `${k}: enabled=${v.enabled}`));
      if (shouldAutoStart) {
        pm.startAutoSync();
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      // Don't stop auto-sync on unmount - let it run in background
    };
  }, []);

  return <>{children}</>;
}