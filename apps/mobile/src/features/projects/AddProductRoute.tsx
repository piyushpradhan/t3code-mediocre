import type { StaticScreenProps } from "@react-navigation/native";
import { AddProductScreen } from "./AddProjectScreen";

type AddProductRouteParams = {
  readonly environmentId?: string | string[];
};

export function AddProductRoute({ route }: StaticScreenProps<AddProductRouteParams | undefined>) {
  return <AddProductScreen {...(route.params ?? {})} />;
}
