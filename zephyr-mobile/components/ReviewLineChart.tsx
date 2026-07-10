import { Text, useWindowDimensions, View } from "react-native";
import {
  LineChart,
  yAxisSides,
  type DataSet,
  type lineDataItem,
} from "react-native-gifted-charts";

export type ReviewLineChartSeries = {
  id: string;
  label: string;
  values: number[];
};

export type ReviewLineChartProps = {
  habitCompletedSeries?: ReviewLineChartSeries;
  labels: string[];
  trackerSeries: ReviewLineChartSeries[];
};

const habitCompletedColor = "#000000";
const trackerColors = [
  "#0f766e",
  "#a16207",
  "#be123c",
  "#4338ca",
  "#047857",
  "#b45309",
  "#0369a1",
  "#7c2d12",
];

function toLineData(labels: string[], values: number[]): lineDataItem[] {
  return labels.map((label, index) => ({
    label,
    value: values[index] ?? 0,
  }));
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View className="flex-row items-center">
      <View
        className="mr-2 h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <Text className="text-xs font-semibold text-neutral-500">{label}</Text>
    </View>
  );
}

function getMaxValue(series: ReviewLineChartSeries[]) {
  return Math.max(0, ...series.flatMap((item) => item.values));
}

function roundUp(value: number, increment: number) {
  return Math.max(increment, Math.ceil(value / increment) * increment);
}

export default function ReviewLineChart({
  habitCompletedSeries,
  labels,
  trackerSeries,
}: ReviewLineChartProps) {
  const { width } = useWindowDimensions();
  const hasData = labels.length > 0;
  const chartWidth = width - 32;
  const axisMax = roundUp(getMaxValue(trackerSeries), 100);
  const dataSet: DataSet[] = [
    ...(habitCompletedSeries
      ? [
          {
            color: habitCompletedColor,
            data: toLineData(labels, habitCompletedSeries.values),
            dataPointsColor: habitCompletedColor,
            dataPointsRadius: 3,
            isSecondary: true,
            thickness: 2,
          },
        ]
      : []),
    ...trackerSeries.map((item, index) => {
      const color = trackerColors[index % trackerColors.length];

      return {
        color,
        data: toLineData(labels, item.values),
        dataPointsColor: color,
        dataPointsRadius: 3,
        thickness: 2,
      };
    }),
  ];

  return (
    <View className="items-center bg-white">
      <View className="w-full flex-row flex-wrap gap-x-4 gap-y-2 px-3 pb-2">
        {habitCompletedSeries ? (
          <LegendItem
            color={habitCompletedColor}
            label={habitCompletedSeries.label}
          />
        ) : null}
        {trackerSeries.map((series, index) => (
          <LegendItem
            key={series.id}
            color={trackerColors[index % trackerColors.length]}
            label={series.label}
          />
        ))}
      </View>

      {hasData ? (
        <LineChart
          adjustToWidth
          dataSet={dataSet}
          disableScroll
          height={180}
          initialSpacing={8}
          maxValue={axisMax}
          noOfSections={4}
          parentWidth={chartWidth}
          roundToDigits={0}
          rulesColor="#eeeeee"
          rulesThickness={1}
          showFractionalValues={false}
          stepValue={axisMax / 4}
          secondaryYAxis={
            habitCompletedSeries
              ? {
                  roundToDigits: 0,
                  showFractionalValues: false,
                  yAxisColor: "#e5e5e5",
                  yAxisLabelWidth: 28,
                  yAxisSide: yAxisSides.RIGHT,
                  yAxisTextStyle: {
                    color: "#737373",
                    fontSize: 10,
                    fontWeight: "600",
                  },
                }
              : undefined
          }
          xAxisColor="#e5e5e5"
          xAxisLabelTextStyle={{
            color: "#737373",
            fontSize: 10,
            fontWeight: "600",
          }}
          xAxisTextNumberOfLines={1}
          yAxisColor="#e5e5e5"
          yAxisLabelWidth={32}
          yAxisTextStyle={{
            color: "#737373",
            fontSize: 10,
            fontWeight: "600",
          }}
        />
      ) : (
        <View className="h-48 items-center justify-center bg-white">
          <Text className="font-semibold text-neutral-400">No graph data</Text>
        </View>
      )}
    </View>
  );
}
