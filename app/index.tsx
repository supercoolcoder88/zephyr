import React, { useEffect, useState } from 'react';
import { Button, ScrollView, Text, TextInput, View } from "react-native";
import { useLLM, LLAMA3_2_3B_QLORA, Message } from 'react-native-executorch';

export default function Index() {
  const [userMessage, setUserMessage] = useState("");
  const [llmResponse, setLlmResponse] = useState("");
  const [startQueryTime, setStartQueryTime] = useState(0)
  const [timeTaken, setTimeTaken] = useState(0)

  const llm = useLLM({ model: LLAMA3_2_3B_QLORA });

  function makeQuery(message: string) {
    console.log("Starting query...");
    setStartQueryTime(Date.now())

    const chat: Message[] = [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: message }
    ];

    llm.generate(chat);
  }

  // This watches for response updates from the hook
  useEffect(() => {
    if (llm.response) {
      setLlmResponse(llm.response);
    }
  }, [llm.response]);

  useEffect(() => {
    if (!llm.isGenerating && startQueryTime !== 0) {
      const total = Date.now() - startQueryTime;
      setTimeTaken(total);
      console.log("Generation completed in", total / 1000, "s");
    }
  }, [llm.isGenerating, startQueryTime]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 20 }}>
      {
        llm.error ? (
          <Text>I BROKE</Text>
        ) : !llm.isReady ? (
          <Text>{(llm.downloadProgress * 100).toFixed(2).toString()}%</Text>
        ) : (
          <>
            <ScrollView className="flex-1">
              <Text>{`Response: ${llmResponse}`}</Text>
            </ScrollView>
            <Text>{`Time taken ${timeTaken}`}</Text>
            <TextInput
              onChangeText={setUserMessage}
              value={userMessage}
              placeholder="Enter message"
              style={{ width: "100%", borderWidth: 1, padding: 8, marginVertical: 10 }}
            />

            <View className="flex-row gap-3 mb-4">
              <Button title="Ask AI" onPress={() => makeQuery(userMessage)} />
              <Button
                title="Clear"
                onPress={() => {
                  setUserMessage("");
                  setLlmResponse("");
                  setTimeTaken(0);
                }}
              />
            </View>
          </>
        )
      }
    </View>
  );
}
