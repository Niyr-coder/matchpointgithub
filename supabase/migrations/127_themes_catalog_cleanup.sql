-- 127 · Limpieza defensiva del catálogo de temas (rediseño §29.20).
-- El catálogo pasó a ser autocontenido: PROFILE_THEMES es la fuente de verdad y
-- cada tema escribe su `key` en las 3 columnas (accent_color/card_style/
-- banner_preset). Las keys legacy de los 3 catálogos sueltos (ej. 'emerald',
-- 'glass', 'ocean', 'emerald-night') ya no resuelven en el render.
--
-- La mig 126 ya reseteó a default a la mayoría; esto es por prolijidad: cualquier
-- perfil cuyo combo NO corresponda a una key de tema vigente vuelve a Clásico
-- (los 3 en null). El render igual cae al default ante una key desconocida, así
-- que esto solo evita estado fantasma. El perfil de sistema (is_system) no se toca.

update public.profiles
set accent_color = null, card_style = null, banner_preset = null
where is_system = false
  and (accent_color is not null or card_style is not null or banner_preset is not null)
  and coalesce(accent_color, card_style, banner_preset) not in (
    'esmeralda', 'oceano', 'crepusculo', 'pizarra', 'neon', 'oro', 'carbon', 'sakura'
  );
