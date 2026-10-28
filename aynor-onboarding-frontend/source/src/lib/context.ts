import { createContext, useContext } from "react";
import type { User } from "./api";
export type AuthContext = {
  user: User | null;
  setUser: (u: User | null) => void;
  development: boolean;
  signedOut?: boolean;
  toast: (s: string) => void;
};
export const Context = createContext<AuthContext>(null!);
export const useApp = () => useContext(Context);
