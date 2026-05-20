-- 126 · Migración al sistema de "temas" curados de personalización.
-- Decisión de producto: los combos libres viejos (accent/card/banner mezclados)
-- se resetean al tema default (Clásico = sin personalización). El user reelige
-- un tema cohesivo desde el panel Personalizar (setTheme). Ver
-- src/lib/profile/customization-presets.ts (PROFILE_THEMES).
--
-- No cambia el schema: el tema sigue guardándose en accent_color/card_style/
-- banner_preset (un tema setea los 3 coherentes). Esto solo limpia los combos
-- existentes. El perfil de sistema (is_system) no se toca.

update public.profiles
set accent_color = null, card_style = null, banner_preset = null
where (accent_color is not null or card_style is not null or banner_preset is not null)
  and is_system = false;
