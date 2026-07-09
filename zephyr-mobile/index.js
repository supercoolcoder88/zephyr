import "@expo/metro-runtime";

import { ExpoRoot } from "expo-router/build/ExpoRoot";
import { Head } from "expo-router/build/head/ExpoHead";
import { renderRootComponent } from "expo-router/build/renderRootComponent";
import { ctx } from "expo-router/_ctx";

function App() {
  return (
    <Head.Provider>
      <ExpoRoot context={ctx} location={__DEV__ ? "/" : undefined} />
    </Head.Provider>
  );
}

renderRootComponent(App);
