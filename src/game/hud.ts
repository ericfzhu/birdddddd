import { VIEW_HEIGHT } from "./constants";

export class HudText {
  private readonly element: HTMLElement;
  private y: number;
  private viewportHeight = VIEW_HEIGHT;
  private viewportOffsetY = 0;

  constructor(id: string, y: number) {
    const element = document.querySelector<HTMLElement>(`#${id}`);
    if (!element) throw new Error(`Missing HUD element #${id}`);
    this.element = element;
    this.y = y;
    this.setY(y);
  }

  setText(value: string): this {
    if (this.element.textContent !== value) this.element.textContent = value;
    return this;
  }

  setVisible(visible: boolean): this {
    this.element.hidden = !visible;
    return this;
  }

  setY(y: number): this {
    this.y = y;
    this.element.style.top = `${((this.viewportOffsetY + y) / this.viewportHeight) * 100}%`;
    return this;
  }

  setViewport(viewportHeight: number, viewportOffsetY: number): this {
    this.viewportHeight = viewportHeight;
    this.viewportOffsetY = viewportOffsetY;
    this.setY(this.y);
    return this;
  }

  setAlpha(alpha: number): this {
    this.element.style.opacity = String(alpha);
    return this;
  }
}
