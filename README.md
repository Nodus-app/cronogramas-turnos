# Cronogramas de Turnos

App web (HTML/CSS/JS puro, sin backend) para que un supervisor gestione los diagramas de turno de personal en petroleras (patrones **14x14**, **7x7**, **7x14** o personalizados), organizados en grupos, con panorama general y planificación de vacaciones/licencias con sugerencia automática de cobertura.

## Uso

Abrí `index.html` en el navegador (localmente, o publicado con GitHub Pages). No requiere instalación ni build.

- **Login**: usuario `admin`, clave `crono2026` (ver/cambiar en `app.js`, constante `CONFIG.users`). Esto es solo un candado de acceso, no seguridad real: los datos y la clave viven en el propio archivo del cliente.
- **Datos**: se guardan en el `localStorage` del navegador (por dispositivo/navegador, no se sincronizan solos entre PCs). Usá **Exportar / Importar** (arriba a la derecha) para respaldar o pasar los datos a otra máquina.

## Funcionalidad

- **Grupos e Integrantes**: creá tantos grupos como quieras (por frente, cliente, zona, etc.), con nombre y color propios. Cada integrante tiene patrón de trabajo (14x14 / 7x7 / 7x14 / personalizado), turno (día fijo, noche fija o alterna día/noche por ciclo) y fecha de inicio de ciclo.
- **Panorama General**: matriz con todos los integrantes (agrupados) día por día — código de color Día / Noche / Franco / Vacaciones / Licencia. Filtrable por grupo, con rango de fechas y cantidad de días configurable.
- **Vacaciones y Cobertura**: elegís integrante + rango de fechas + tipo (vacaciones o licencia/médico); la app guarda la novedad y sugiere quién puede cubrirlo, priorizando compañeros del mismo grupo que estén de franco en esas fechas, ordenados por % de días cubiertos.

## Estructura

- `index.html` — estructura y modales
- `style.css` — estilos (tema oscuro)
- `app.js` — lógica de patrones, estado (localStorage) y render
