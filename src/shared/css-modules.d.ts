/** يسمح بـ`import styles from './X.module.css'` مكتوب الأنواع. Vite يتولّى التحويل وقت البناء. */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}

/**
 * `?inline` يعطي نصّ الورقة بدل حقنها في `<head>`.
 *
 * الطبقة داخل الصفحة تعيش في Shadow Root مغلق، والحقن في رأس المستند لا
 * يصلها. النصّ يُتبنّى عبر `adoptedStyleSheets` على جذر الظلّ.
 */
declare module '*.css?inline' {
  const css: string
  export default css
}
