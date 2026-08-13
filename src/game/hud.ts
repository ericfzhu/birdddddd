import { VIEW_HEIGHT } from "./constants";

export class HudText {
  private readonly element: HTMLElement;

  constructor(id: string, y: number) {
    const element = document.querySelector<HTMLElement>(`#${id}`);
    if (!element) throw new Error(`Missing HUD element #${id}`);
    this.element = element;
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
    this.element.style.top = `${(y / VIEW_HEIGHT) * 100}%`;
    return this;
  }

  setAlpha(alpha: number): this {
    this.element.style.opacity = String(alpha);
    return this;
  }
}
