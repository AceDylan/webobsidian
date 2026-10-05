import { t } from '../lib/i18n';

/** Secondary bilingual label, visible only in the Neural theme's chrome. */
export default function ChromeLabel({ english, chinese }: { english: string; chinese: string }) {
  const translated = t(english) !== english;
  return <span className="neural-caption" lang={translated ? 'en' : 'zh-CN'}>{translated ? english.toUpperCase() : chinese}</span>;
}
