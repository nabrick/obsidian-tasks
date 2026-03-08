[![Version](https://img.shields.io/badge/version-1.0.0-lightgrey.svg)]()
[![License](https://img.shields.io/badge/license-MIT-lightgrey.svg)]()
[![Status](https://img.shields.io/badge/status-active-lightgrey.svg)]()

# Tareas for Obsidian
Plugin para Obsidian que añade un tareador diario en el panel lateral para gestionar tareas con fechas, prioridades, subtareas y limpieza automática.

## Características
* Panel lateral con tareas **de hoy y atrasadas**, agrupadas por fecha
* **Prioridades** (🔴 Alta / 🟡 Media / 🟢 Baja) con indicador visual
* **Subtareas** con barra de progreso y auto-completado
* Fechas relativas: *Hoy*, *Ayer*, *Hace N días*, *Mañana*
* Marcado como completada con **fecha de cierre automática**
* Botones para **editar**, **reprogramar** y **eliminar** tareas
* Toggle para mostrar u ocultar **tareas futuras**
* **Limpieza automática** de tareas completadas con más de 7 días
* Las tareas se guardan en `Tasks.md` dentro de tu vault — **encriptable**
* Atajo de teclado `Cmd/Ctrl + Shift + T` para nueva tarea
* Interfaz adaptada a **móvil**

## Instalación

### Método manual (GitHub)

1. Descarga este repositorio como `.zip`
2. Extrae el contenido
3. Copia la carpeta `tasks-plugin` dentro de:
```
<tu-vault>/.obsidian/plugins/
```
4. Abre Obsidian → *Settings* → *Community plugins*
5. Activa **Tareas**

> Asegúrate de tener activados los *Community plugins*.

## Uso
1. Haz clic en el icono ☑️ del ribbon lateral, o usa el comando `Abrir Tareas`
2. Pulsa ➕ en el ribbon o usa `Cmd/Ctrl + Shift + T` para crear una tarea
3. Asigna título, fecha, prioridad, descripción y subtareas opcionales
4. Marca el checkbox para completar — las completadas desaparecen tras 7 días
5. Usa 🔄 para reprogramar, ✏️ para editar o 🗑️ para eliminar

## Configuración

Ve a **Settings → Tareas** para personalizar:

| Opción | Descripción | Por defecto |
|---|---|---|
| Carpeta de guardado | Dónde se guardará `Tasks.md` | Raíz del vault |

Ejemplo: si configuras `📝 Anexos`, las tareas se guardan en `📝 Anexos/Tasks.md`.

## Formato del archivo Tasks.md

Las tareas se almacenan como una tabla Markdown estándar:

```
| ID | ✓ | Título | Fecha | Prioridad | Completado | Descripción | Subtareas |
```

Las subtareas se serializan dentro de la celda separadas por `~~`:
```
[x]Subtarea completada~~[ ]Subtarea pendiente
```

## ¿Para quién es?

* Usuarios que quieren gestionar sus tareas sin salir de Obsidian
* Personas que trabajan con **notas diarias** y necesitan un seguimiento simple
* Quienes quieren mantener sus tareas en un archivo `.md` propio y encriptable

## Estructura del proyecto

```
tasks-plugin/
├── main.js
├── manifest.json
├── package.json
├── styles.css
└── data.json
```

## Licencia

Este proyecto está bajo licencia **MIT**

## Contribuciones

Pull requests y mejoras son bienvenidas