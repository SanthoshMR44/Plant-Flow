import type { Plant } from '../types/plant';
import { INITIAL_PLANTS } from '../data/cementPlantDemo';
import { validatePlantsStorage } from '../utils/plantValidation';

const STORAGE_KEY = 'plant_designer_plants';

export const storageService = {
  loadPlants(): Record<string, Plant> {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const validated = validatePlantsStorage(parsed);
        if (validated) {
          return validated;
        } else {
          console.warn('Storage validation failed. Reverting to default demo plants.');
        }
      }
    } catch (e) {
      console.error('Failed to load plants from storage:', e);
    }
    return INITIAL_PLANTS;
  },

  savePlants(plants: Record<string, Plant>): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(plants));
      return true;
    } catch (e) {
      console.error('Failed to save plants to storage:', e);
      return false;
    }
  },

  clearStorage(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.error('Failed to clear storage:', e);
    }
  },
};
