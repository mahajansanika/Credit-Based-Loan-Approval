/**
 * Run the client-side engine mirror reactively. Used by the live simulator
 * and the form's instant feedback — identical output to the backend.
 */
import { useMemo } from 'react';
import { runFullEngine } from '../engine/engine.js';

export function useEngine(inputs, config, options) {
  const inputsKey = JSON.stringify(inputs);
  const configKey = JSON.stringify(config);
  return useMemo(() => {
    try {
      return runFullEngine(inputs, config, options);
    } catch (err) {
      console.error('[engine]', err);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputsKey, configKey]);
}
