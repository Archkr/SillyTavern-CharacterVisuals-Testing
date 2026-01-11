import { Vector3 } from '../../world/schema';

export type SnapMode = 'grid' | 'angle';

export interface SnapSettings {
  enabled: boolean;
  increment: number;
  mode: SnapMode;
}

export const defaultSnapSettings: SnapSettings = {
  enabled: false,
  increment: 0.5,
  mode: 'grid',
};

export const snapValue = (value: number, settings: SnapSettings): number => {
  if (!settings.enabled || settings.increment <= 0) {
    return value;
  }

  return Math.round(value / settings.increment) * settings.increment;
};

export const snapVector = (value: Vector3, settings: SnapSettings): Vector3 => ({
  x: snapValue(value.x, settings),
  y: snapValue(value.y, settings),
  z: snapValue(value.z, settings),
});
