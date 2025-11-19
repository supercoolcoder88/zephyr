import { initLlama, loadLlamaModelInfo } from 'llama.rn';
import React, { useEffect, useState } from 'react';
import { Button, Text, TextInput, View } from "react-native";

interface ModelResponse {
  message: string;
  timeTaken: number
}
export default function Index() {
  const [userMessage, setUserMessage] = useState("")
  const [llmResponse, setLlmResponse] = useState<ModelResponse>({
    message: "",
    timeTaken: 0
  })
  
  const modelPath = 'file:///tmp/Llama-3.2-3B-Instruct-Q4_K_M.gguf'

  useEffect(() => {
    loadModel(modelPath)
  }, [])
  
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text>Try the AI out</Text>
      <TextInput
          onChangeText={(text: string) => {setUserMessage(text)}}
          value={userMessage}
          placeholder="Enter message"
        />
      <Button
        onPress={() => makeQuery(modelPath, userMessage)}
        title="Ask AI"
      />
      <View>
        <Text>
          {
            `Response: ${llmResponse.message}\n Time taken: ${llmResponse.timeTaken}`
          }
        </Text>
      </View>
    </View>
  );
}

async function loadModel(path:string) {
  console.log('Model Info:', await loadLlamaModelInfo(path))
}

async function makeQuery(path:string, userMessage: string): Promise<ModelResponse> {
  // Initial a Llama context with the model (may take a while)
  const context = await initLlama({
    model: path,
    use_mlock: true,
    n_ctx: 2048, // context window, max is 4096
    n_gpu_layers: 99,
  })

  const stopWords = ['</s>', '<|end|>', '<|eot_id|>', '<|end_of_text|>', '<|im_end|>', '<|EOT|>', '<|END_OF_TURN_TOKEN|>', '<|end_of_turn|>', '<|endoftext|>']

  // Do chat completion
  const msgResult = await context.completion(
    {
      messages: [
        {
          role: 'system',
          content: 'This is a conversation between user and assistant, a friendly chatbot.',
        },
        {
          role: 'user',
          content: `${userMessage}`,
        },
      ],
      n_predict: 100,
      stop: stopWords,
    },
    ({ token }) => {
      // This is a partial completion callback, meaning the data will stream as it returns tokens
      // modelResponse += token will add a state or something as it goes, make sure to move this out of component otherwise it will rerender over n over
    },
  )
  console.log('Result:', msgResult.text)
  console.log('Timings:', msgResult.timings)
  return ({
    message: msgResult.text,
    timeTaken: msgResult.timings
  })
}