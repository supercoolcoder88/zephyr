import { loadLlamaModelInfo } from 'llama.rn';
import { useEffect } from 'react';
import { Text, View } from "react-native";

export default function Index() {
  const modelPath = 'file:///tmp/Llama-3.2-3B-Instruct-Q4_K_M.gguf'

  useEffect(() => {
    loadModel()
  }, [])
  
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text>Edit app/index.tsx to edit this screen.</Text>
    </View>
  );
}

async function loadModel(path:string) {
  
  console.log('Model Info:', await loadLlamaModelInfo(path))
}

async function makeQuery(path:string) {
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
          content: 'Hello!',
        },
      ],
      n_predict: 100,
      stop: stopWords,
    },
    ({ token }) => {
      // This is a partial completion callback, meaning the data will stream as it returns tokens
      // liveText += token will add a state or something as it goes
    },
  )
  console.log('Result:', msgResult.text)
  console.log('Timings:', msgResult.timings)
}