/**
 * Rule-config state: fetches the active config from the backend, exposes the
 * working (possibly edited) config, live validation warnings, and save /
 * activate / delete / import / export operations. Falls back to the local
 * default config when the backend is offline so the whole app keeps working.
 */
import { createContext, useContext, useState, useEffect, useMemo, useCallback, createElement } from 'react';
import toast from 'react-hot-toast';
import { api } from '../api/client.js';
import { defaultConfig } from '../config/defaultConfig.js';
import { validateConfig } from '../engine/engine.js';

const ConfigContext = createContext(null);

export function ConfigProvider({ children }) {
  const [config, setConfigState] = useState(defaultConfig);
  const [activeName, setActiveName] = useState(defaultConfig.name);
  const [savedConfigs, setSavedConfigs] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [offline, setOffline] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [activeRes, listRes] = await Promise.all([
        api.get('/config/active', { suppressToast: true }),
        api.get('/config', { suppressToast: true }),
      ]);
      setConfigState(activeRes.data.config);
      setActiveName(activeRes.data.name);
      setSavedConfigs(listRes.data.configs);
      setOffline(false);
      setDirty(false);
    } catch {
      setOffline(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const setConfig = useCallback((next) => {
    setConfigState(next);
    setDirty(true);
  }, []);

  const warnings = useMemo(() => validateConfig(config), [config]);

  const saveConfig = useCallback(
    async (name) => {
      const res = await api.post('/config', { name, config: { ...config, name }, activate: true });
      toast.success(`Config "${name}" saved and activated.`);
      setActiveName(name);
      setDirty(false);
      await refresh();
      setConfigState({ ...config, name });
      return res.data;
    },
    [config, refresh]
  );

  const activateConfig = useCallback(
    async (id) => {
      await api.put(`/config/${id}/activate`);
      toast.success('Config activated.');
      await refresh();
    },
    [refresh]
  );

  const deleteConfig = useCallback(
    async (id) => {
      await api.delete(`/config/${id}`);
      toast.success('Config deleted.');
      await refresh();
    },
    [refresh]
  );

  const loadConfig = useCallback((saved) => {
    setConfigState(saved.config);
    setDirty(true);
    toast.success(`Loaded "${saved.name}" into the editor (unsaved).`);
  }, []);

  const resetToDefault = useCallback(() => {
    setConfigState(defaultConfig);
    setDirty(true);
  }, []);

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rule-config-${(config.name ?? 'custom').replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [config]);

  const importJSON = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const required = ['hardRejectRules', 'scoringWeights', 'scoringThresholds', 'scoreBands', 'interactionRules'];
        const missing = required.filter((k) => !(k in parsed));
        if (missing.length) {
          toast.error(`Invalid config file — missing: ${missing.join(', ')}`);
          return;
        }
        setConfigState(parsed);
        setDirty(true);
        toast.success('Config imported into the editor (unsaved).');
      } catch {
        toast.error('Could not parse the JSON file.');
      }
    };
    reader.readAsText(file);
  }, []);

  const value = {
    config, setConfig, warnings, dirty, offline, loaded,
    activeName, savedConfigs, refresh,
    saveConfig, activateConfig, deleteConfig, loadConfig, resetToDefault,
    exportJSON, importJSON,
  };
  return createElement(ConfigContext.Provider, { value }, children);
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error('useConfig must be used inside ConfigProvider');
  return ctx;
}
