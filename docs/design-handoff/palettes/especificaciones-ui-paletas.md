# Guía de Implementación: Paletas y Especificaciones UI - Alquileres AyA

Este documento contiene la especificación técnica completa de diseño, tokens de color (HEX, Tailwind), tipografía, componentes y código para que cualquier desarrollador o agente de IA pueda implementar directamente ambas opciones de diseño.

---

## 1. Paleta 1: "Costa & Océano" (Azul Marino & Menta Fresca)
*Estilo profesional, limpio, sólido y con alta legibilidad para gestión de alojamientos costeros.*

### Tokens de Color (HEX y Tailwind)
- **Fondo General (Canvas):** `#F8FAFC` (Tailwind: `bg-slate-50`)
- **Superficies / Cards:** `#FFFFFF` (Tailwind: `bg-white`)
- **Bordes de Cards:** `#E2E8F0` (Tailwind: `border border-slate-200`)
- **Texto Principal / Títulos:** `#0F172A` (Tailwind: `text-slate-900`)
- **Texto Secundario / Labels:** `#64748B` (Tailwind: `text-slate-500`)
- **Primario / Acción Principal (Botón "Anotar reserva", Chips activos):** `#1D4ED8` o `#1E40AF` (Tailwind: `bg-blue-700` o `bg-blue-800`, hover `bg-blue-900`, texto `text-white`)
- **Acento WhatsApp:** `#10B981` / `#059669` (Tailwind: `bg-emerald-500`, texto `text-white`)
- **Disponibilidad "Libre" (Badges):**
  - Fondo: `#ECFDF5` (`bg-emerald-50`)
  - Texto: `#065F46` (`text-emerald-800`)
  - Borde / Punto: `#10B981` (`emerald-500`)
- **Estados en Calendario:**
  - Rango Reserva A: `#DBEAFE` (`bg-blue-100`, texto `#1E40AF`)
  - Rango Reserva B: `#D1FAE5` (`bg-emerald-100`, texto `#065F46`)
  - Rango Ocupado General: `#F1F5F9` (`bg-slate-100`)
- **Alertas de Saldo ("Debe $..."):**
  - Fondo: `#FEF3C7` (`bg-amber-100`)
  - Texto: `#B45309` (`text-amber-700 font-semibold`)
- **Navegación Inferior (Tabs):**
  - Inactivo: `#94A3B8` (`text-slate-400`)
  - Activo: `#1D4ED8` (`text-blue-700`)

---

## 2. Paleta 2: "Rosa, Violeta & Lila" (Blush & Frambuesa)
*Estilo acogedor, boutique, cálido y moderno con matices suaves de lila, frambuesa y rosa empolvado.*

### Tokens de Color (HEX y Tailwind)
- **Fondo General (Canvas):** `#FFF5F8` o `#FAF5F7` (Tailwind custom: `bg-[#FFF5F8]`)
- **Superficies / Cards:** `#FFFFFF` (Tailwind: `bg-white`)
- **Bordes de Cards:** `#FCE7F3` (Tailwind: `border border-pink-100`)
- **Texto Principal / Títulos:** `#4A044E` o `#1F1424` (Tailwind: `text-fuchsia-950` o `text-slate-900`)
- **Texto Secundario / Labels:** `#9D7B8E` (Tailwind custom: `text-[#9D7B8E]`)
- **Primario / Acción Principal (Botón "Anotar reserva"):**
  - Gradiente o color sólido: `bg-gradient-to-r from-[#9D174D] to-[#7C3AED]` o `#9D174D` (Frambuesa profundo a violeta, texto `text-white`)
- **Chips Activos:** `#9D174D` (Frambuesa intenso, `text-white`)
- **Acento WhatsApp:** `#10B981` (`bg-emerald-500`, texto `text-white`)
- **Disponibilidad "Libre" (Badges):**
  - Fondo: `#ECFDF5` (`bg-emerald-50`)
  - Texto: `#065F46` (`text-emerald-800`)
- **Estados en Calendario:**
  - Rango Reserva A (Leo): `#FCE7F3` (`bg-pink-100`, texto `#9D174D`)
  - Rango Reserva B (Nahir): `#EDE9FE` (`bg-violet-100`, texto `#5B21B6`)
  - Rango Ocupado General: `#F3E8FF` (`bg-purple-100`)
- **Alertas de Saldo ("Debe $..."):**
  - Fondo: `#FFE4E6` (`bg-rose-100`)
  - Texto: `#BE123C` (`text-rose-700 font-semibold`)
- **Navegación Inferior (Tabs):**
  - Inactivo: `#C084FC` o `#A8A29E` (`text-slate-400`)
  - Activo: `#9D174D` (`text-pink-700` o fucsia)

---

## 3. Especificación de Componentes Clave

### 1. Barra de Navegación Inferior (Bottom Nav)
- Altura: `64px` a `72px`, anclada al fondo (`fixed bottom-0 left-0 right-0 max-w-md mx-auto`).
- 4 Tabs: Inicio, Calendario, Huéspedes, Cabañas.
- Iconos de 20x20px con texto de 11px debajo.

### 2. Tarjetas de Información (Cards)
- Radio de borde: `rounded-2xl` (`16px`).
- Padding: `p-4` o `p-5`.
- Sombras: Sutiles `shadow-sm` con borde fino de `1px` (`border border-slate-100` o `border-pink-100`).

### 3. Matriz de Calendario
- Días de la semana: `L M M J V S D` en tamaño `12px` font-medium.
- Celdas de días: cuadrícula de 7 columnas (`grid grid-cols-7 gap-y-1 text-center`).
- Conexión de rangos de reserva: aplicar `rounded-l-full` al primer día, fondo continuo a los intermedios, y `rounded-r-full` al último día del rango.

### 4. Input y Búsquedas
- Altura: `48px`.
- Radio: `rounded-xl` o `rounded-2xl`.
- Icono de lupa a la izquierda y placeholder tenue.

---

## 4. Referencia de Pantallas Generadas en Stitch
- **Costa - Inicio:** Pantalla dashboard con métricas de disponibilidad y llegadas.
- **Costa - Calendario Host:** Vista mensual con rangos coloreados y detalle de reservas.
- **Costa - Huéspedes:** Directorio de clientes con deuda y estadías.
- **Costa - Vista Pública WhatsApp:** Vista pública de disponibilidad con botón directo a chat.
- **Blush - Inicio / Calendario / Huéspedes / Pública:** Mismas vistas adaptadas a la paleta cálida frambuesa/lila.
