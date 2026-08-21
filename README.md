# Cronogramas de Turnos

App web (HTML/CSS/JS puro) para que un supervisor gestione los diagramas de turno de personal en petroleras (patrones **14x14**, **7x7**, **7x14** o personalizados), organizados en grupos, con panorama general, planificación de vacaciones/licencias con sugerencia automática de cobertura, y acceso individual para que cada empleado vea su propio diagrama y pida vacaciones desde su celular.

Los datos viven en un **Google Sheet**, leídos y escritos a través de un **Google Apps Script** publicado como Web App. No hay ningún otro backend ni costo asociado.

## 1. Desplegar el backend (una sola vez)

1. Abrí el Google Sheet **"Cronogramas Turnos - Base de Datos"** (ya creado, con las pestañas `Usuarios`, `Grupos`, `Integrantes`, `Novedades`).
2. **Extensiones → Apps Script**.
3. Borrá el contenido por defecto y pegá todo el archivo `Code.gs` de este repo.
4. **Implementar → Nueva implementación → Tipo: Aplicación web**.
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
5. Autorizá los permisos (es tu propio script leyendo tu propio Sheet).
6. Copiá la URL que termina en `/exec`.
7. En `app.js`, reemplazá la constante `API_URL` por esa URL, y subí el cambio al repo (o a GitHub Pages).

Cada vez que edites `Code.gs` tenés que hacer **Implementar → Gestionar implementaciones → editar (lápiz) → Nueva versión → Implementar** para que los cambios tomen efecto (la URL no cambia).

## 2. Usuarios y roles

Todo el control de acceso vive en la pestaña **Usuarios** del Sheet:

| email | clave | rol | integranteId | nombre |
|---|---|---|---|---|
| admin@cronoturnos.local | crono2026 | supervisor | | Supervisor |

- **Supervisores**: la única forma de crear un supervisor nuevo es agregando una fila a mano en esta pestaña con `rol = supervisor`. La app nunca deja que alguien se auto-asigne ese rol — solo quien tiene permiso de edición sobre el Sheet (vos, o a quien le compartas el Sheet) puede otorgarlo. Cambiá la clave del `admin` por defecto apenas lo despliegues.
- **Empleados**: se crean automáticamente cuando un supervisor, al cargar o editar un integrante desde la app, tilda **"Habilitar acceso"** y le pone un email + clave. No hace falta tocar el Sheet a mano para esto.

## 3. Publicar el frontend

`index.html`, `style.css` y `app.js` son estáticos — podés abrirlos directo o publicarlos con GitHub Pages (**Settings → Pages → Source: Deploy from a branch → main / (root)**).

## 4. Uso

- **Supervisor**: ve Panorama General (matriz de todos los grupos, de 14 a 365 días), gestiona Grupos e Integrantes, carga vacaciones/licencias y aprueba o rechaza las que piden los empleados, con sugerencia de cobertura (compañeros de franco en esas fechas).
- **Empleado**: ve solo su propio diagrama y puede pedir vacaciones/licencia, que quedan "pendiente" hasta que el supervisor las aprueba.

### Carga masiva de integrantes

En **Grupos e Integrantes** hay un botón **"Descargar plantilla (CSV)"** con las columnas necesarias (Grupo, Nombre, Patrón, Turno, Fecha de inicio, y opcionalmente email/clave de acceso). Completala en Excel o Google Sheets, exportá como CSV y subila con **"Importar CSV"**: los grupos que no existan se crean solos, y cada fila se da de alta como integrante.

## Estructura

```
index.html   → estructura y modales
style.css    → estilos (tema oscuro)
app.js       → lógica de patrones, llamadas a la API y render (frontend)
Code.gs      → backend: Apps Script sobre el Google Sheet
```
