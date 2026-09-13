"use client";

import { Children, createContext, useContext, useId, useState, type ReactNode } from "react";
import styles from "./property-detail-view.module.css";

/** Changes display only; server-filtered scene nodes retain their own gates. */
const SceneContext = createContext<{selected: number; setSelected: (value: number) => void} | null>(null);
export function PropertySceneProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState(0);
  return <SceneContext.Provider value={{selected, setSelected}}>{children}</SceneContext.Provider>;
}
export default function PropertySceneWorkspace({ labels, children, en, showPicker = true }: { labels: string[]; children: ReactNode; en: boolean; showPicker?: boolean }) {
  const [local, setLocal] = useState(0);
  const shared = useContext(SceneContext);
  const selected = shared?.selected ?? local;
  const setSelected = shared?.setSelected ?? setLocal;
  const id = useId();
  const scenes = Children.toArray(children);
  const active = Math.min(selected, Math.max(0, scenes.length - 1));
  return (
    <div>
      {showPicker && labels.length > 1 && (
        <div className={styles.scenePicker} role="group" aria-label={en ? "Choose a 3DGS scene" : "3DGSシーンを選択"}>
          {labels.map((label, index) => <button key={index} type="button" aria-pressed={active === index} aria-controls={id} onClick={() => setSelected(index)}>{label}</button>)}
        </div>
      )}
      <div id={id}>{scenes[active]}</div>
    </div>
  );
}
