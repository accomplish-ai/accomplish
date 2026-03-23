/**
 * Ambient type declarations for native/optional dependencies.
 *
 * @nut-tree/nut-js is a native module that requires platform-specific binaries
 * and OS accessibility permissions. It may not be installed during normal
 * development. This shim provides minimal type information so the IDE
 * does not flag unresolved imports while still allowing nut.js to be
 * loaded dynamically at runtime via `import('@nut-tree/nut-js')`.
 */

declare module '@nut-tree/nut-js' {
  export interface PointInterface {
    x: number;
    y: number;
  }

  export interface RegionInterface {
    left: number;
    top: number;
    width: number;
    height: number;
  }

  export interface ImageInterface {
    data: Uint8Array;
    width: number;
    height: number;
  }

  export const Point: new (x: number, y: number) => PointInterface;

  export const Button: {
    LEFT: number;
    RIGHT: number;
    MIDDLE: number;
  };

  export const Key: Record<string, number>;

  export const mouse: {
    setPosition(point: PointInterface): Promise<void>;
    click(button: number): Promise<void>;
    doubleClick(button: number): Promise<void>;
    scrollDown(amount: number): Promise<void>;
    scrollUp(amount: number): Promise<void>;
    scrollLeft(amount: number): Promise<void>;
    scrollRight(amount: number): Promise<void>;
  };

  export const keyboard: {
    type(text: string): Promise<void>;
    pressKey(...keys: number[]): Promise<void>;
    releaseKey(...keys: number[]): Promise<void>;
  };

  export const screen: {
    width(): Promise<number>;
    height(): Promise<number>;
    grabRegion(region: RegionInterface): Promise<ImageInterface>;
  };
}
