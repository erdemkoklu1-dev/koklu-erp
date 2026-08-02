/**
 * `node --import ./tests/helpers/register-alias.mjs` ile yüklenir ve `@/…`
 * alias çözümlemesini test sürecine kaydeder.
 */

import { register } from 'node:module'

register('./alias-hooks.mjs', import.meta.url)
