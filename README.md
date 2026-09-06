# Вишлист v11 — стабильная версия

Эта версия не ломает сайт, если Supabase ещё не настроен. По умолчанию работает локальный режим: добавление, удаление, поиск и бронирование работают в браузере.

## Если нужна общая база для всех

В `index.html` внизу найди:

```html
<script>window.SUPABASE_CONFIG = window.SUPABASE_CONFIG || { url: "", anonKey: "" };</script>
```

И замени на:

```html
<script>window.SUPABASE_CONFIG = {
  url: "https://ТВОЙ-ПРОЕКТ.supabase.co",
  anonKey: "sb_publishable_ТВОЙ_КЛЮЧ"
};</script>
```

Нужны именно Project URL и Publishable key из Supabase Connect / Settings → API Keys. Secret key сюда вставлять нельзя.

После этого загрузить проект на Vercel заново. Если данные Supabase неправильные или недоступны, сайт автоматически остаётся рабочим в локальном режиме.

## База

Для общей базы выполни `supabase_setup.sql` в Supabase SQL Editor. Таблица должна быть доступна через Data API, с RLS-политиками, и добавлена в Realtime publication.
