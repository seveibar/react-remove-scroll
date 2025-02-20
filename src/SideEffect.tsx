import * as React from 'react';
import {TouchEvent} from "react";
import {RemoveScrollBar} from 'react-remove-scroll-bar';
import {styleSingleton} from 'react-style-singleton';
import {handleScroll, locationCouldBeScrolled} from "./handleScroll";
import {nonPassive} from './aggresiveCapture';
import {Axis, IRemoveScrollEffectProps} from "./types";

export const getTouchXY = (event: TouchEvent) => (
  event.changedTouches
    ? [event.changedTouches[0].clientX, event.changedTouches[0].clientY]
    : [0, 0]
);

export const getDeltaXY = (event: WheelEvent) => (
  [event.deltaX, event.deltaY]
);

const extractRef = (ref: React.RefObject<any> | HTMLElement): HTMLElement => (
  (ref && 'current' in ref) ? ref.current : ref
);

const deltaCompare = (x: number[], y: number[]) => (
  x[0] === y[0] && x[1] === y[1]
);

const generateStyle = (id: number) => `
  .block-interactivity-${id} {pointer-events: none;}
  .allow-interactivity-${id} {pointer-events: all;}
`;

let idCounter = 0;
let lockStack: any[] = [];

export function RemoveScrollSideCar(props: IRemoveScrollEffectProps) {
  const shouldPreventQueue = React.useRef<Array<{ name: string, delta: number[], target: any, should: boolean }>>([]);
  const touchStartRef = React.useRef([0, 0]);
  const activeAxis = React.useRef<Axis | undefined>();
  const [id] = React.useState(idCounter++);
  const [Style] = React.useState(() => styleSingleton());
  const lastProps = React.useRef<IRemoveScrollEffectProps>(props);

  React.useEffect(() => {
    lastProps.current = props;
  }, [props]);

  React.useEffect(() => {
    if (props.inert) {
      document.body.classList.add(`block-interactivity-${id}`);
      const allow = [
        props.lockRef.current,
        ...(props.shards || []).map(extractRef)
      ].filter(Boolean);
      allow.forEach(el => el!.classList.add(`allow-interactivity-${id}`));

      return () => {
        document.body.classList.remove(`block-interactivity-${id}`);
        allow.forEach(el => el!.classList.remove(`allow-interactivity-${id}`));
      }
    }

    return;
  }, [props.inert, props.lockRef.current, props.shards]);

  const shouldCancelEvent = React.useCallback((event: any, parent: HTMLElement) => {
    const touch = getTouchXY(event);
    const touchStart = touchStartRef.current;
    const deltaX = 'deltaX' in event ? event.deltaX : (touchStart[0] - touch[0]);
    const deltaY = 'deltaY' in event ? event.deltaY : (touchStart[1] - touch[1]);

    let currentAxis: Axis | undefined;
    let target: HTMLElement = event.target as any;

    const moveDirection: Axis = Math.abs(deltaX) > Math.abs(deltaY) ? 'h' : 'v';

    let canBeScrolledInMainDirection = locationCouldBeScrolled(moveDirection, target);

    if (!canBeScrolledInMainDirection) {
      return true;
    }

    if (canBeScrolledInMainDirection) {
      currentAxis = moveDirection;
    } else {
      currentAxis = moveDirection === 'v' ? 'h' : 'v';
      canBeScrolledInMainDirection = locationCouldBeScrolled(moveDirection, target);
      // other axis might be not scrollable
    }

    if (!canBeScrolledInMainDirection) {
      return false;
    }

    if (!activeAxis.current && event.changedTouches && (deltaX || deltaY)) {
      activeAxis.current = currentAxis;
    }

    if (!currentAxis) {
      return true
    }

    const cancelingAxis = activeAxis.current || currentAxis;

    return handleScroll(
      cancelingAxis,
      parent,
      event,
      cancelingAxis == 'h' ? deltaX : deltaY
    );
  }, []);

  const shouldPrevent = React.useCallback((event: any) => {
    if (!lockStack.length || lockStack[lockStack.length - 1] !== Style) {
      // not the last active
      return;
    }
    const delta = 'deltaY' in event ? getDeltaXY(event) : getTouchXY(event);
    const sourceEvent = shouldPreventQueue.current.filter(
      (e) => e.name === event.type && e.target === event.target && deltaCompare(e.delta, delta)
    )[0];
    // self event, and should be canceled
    if (sourceEvent && sourceEvent.should) {
      event.preventDefault();
      return;
    }
    // outside or shard event
    if (!sourceEvent) {
      const shardNodes = (lastProps.current.shards || [])
        .map(extractRef)
        .filter(Boolean)
        .filter(node => node.contains(event.target));

      const shouldStop = shardNodes.length > 0
        ? shouldCancelEvent(event, shardNodes[0])
        : !lastProps.current.noIsolation;

      if (shouldStop) {
        event.preventDefault();
      }
    }
  }, []);

  const shouldCancel = React.useCallback((name: string, delta: number[], target: any, should: boolean) => {
    const event = {name, delta, target, should};
    shouldPreventQueue.current.push(event);
    setTimeout(() => {
      shouldPreventQueue.current = shouldPreventQueue.current.filter(e => e !== event);
    }, 1);
  }, []);

  const scrollTouchStart = React.useCallback((event: any) => {
    touchStartRef.current = getTouchXY(event);
    activeAxis.current = undefined;
  }, []);

  const scrollWheel = React.useCallback((event: WheelEvent) => {
    shouldCancel(event.type, getDeltaXY(event), event.target, shouldCancelEvent(event, props.lockRef.current as any));
  }, []);

  const scrollTouchMove = React.useCallback((event: TouchEvent<HTMLDivElement>) => {
    shouldCancel(event.type, getTouchXY(event), event.target, shouldCancelEvent(event, props.lockRef.current as any));
  }, []);

  React.useEffect(() => {
    lockStack.push(Style);
    props.setCallbacks({
      onScrollCapture: scrollWheel,
      onWheelCapture: scrollWheel,
      onTouchMoveCapture: scrollTouchMove,
    });

    document.addEventListener('wheel', shouldPrevent, nonPassive);
    document.addEventListener('touchmove', shouldPrevent, nonPassive);
    document.addEventListener('touchstart', scrollTouchStart, nonPassive);

    return () => {
      lockStack = lockStack.filter(inst => inst !== Style);

      document.removeEventListener('wheel', shouldPrevent, nonPassive as any);
      document.removeEventListener('touchmove', shouldPrevent, nonPassive as any);
      document.removeEventListener('touchstart', scrollTouchStart, nonPassive as any);

    }
  }, []);


  const {removeScrollBar, inert} = props;

  return (
    <React.Fragment>
      {
        inert
          ? <Style styles={generateStyle(id)}/>
          : null
      }
      {
        removeScrollBar
          ? <RemoveScrollBar gapMode="margin"/>
          : null
      }
    </React.Fragment>
  )
}