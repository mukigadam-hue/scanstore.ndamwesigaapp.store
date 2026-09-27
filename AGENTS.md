# Project rules
- Keep English fallback entries for every visible translation key and validate all supported languages with the translation-key test, so untranslated identifiers never appear in the app.
- Interstitials use the native WebViewGold bridge at approved checkpoints only; browser placeholders are not ads and must never block users.
- Local-file actions use mounted `accept="*/*"` inputs directly over their controls, because synthetic clicks and empty accept types are unreliable in Android WebViews.
