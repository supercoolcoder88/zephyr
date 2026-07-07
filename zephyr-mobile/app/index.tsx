import { Text, View } from "react-native";
import { useSQLiteContext, type SQLiteDatabase } from "expo-sqlite";

type HomeContentProps = {
  database: SQLiteDatabase;
};

function HomeContent({ database }: HomeContentProps) {
  return (
    <View>
      <Text>Open up app/index.tsx to start working on your app!</Text>
    </View>
  );
}

export default function App() {
  const database = useSQLiteContext();

  return (
    <HomeContent database={database} />
  );
}
