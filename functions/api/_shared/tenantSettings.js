import {
  BUSINESS_TYPES as BUSINESS_TYPE_OPTIONS,
  DEFAULT_MODULES_BY_BUSINESS_TYPE,
  defaultModulesForBusinessType,
  normalizeBusinessType,
  normalizeModuleSettings,
} from '../../../shared/modules.js';

export const BUSINESS_TYPES = BUSINESS_TYPE_OPTIONS.map((item) => item.value);
export { DEFAULT_MODULES_BY_BUSINESS_TYPE, defaultModulesForBusinessType, normalizeBusinessType, normalizeModuleSettings };

export function normalizeTenantSettings(settings = {}, incoming = {}) {
  const has = (key) => Object.prototype.hasOwnProperty.call(incoming, key);
  const businessType = normalizeBusinessType(
    has('businessType') ? incoming.businessType : settings.businessType,
    settings.businessType || 'food',
  );
  return {
    businessType,
    modules: normalizeModuleSettings(has('modules') ? incoming.modules : settings.modules, businessType),
  };
}
