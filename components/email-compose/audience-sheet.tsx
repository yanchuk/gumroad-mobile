import type { AudienceOption, AudienceType } from "@/components/email-compose/use-audience-options";
import { LineIcon } from "@/components/icon";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Text } from "@/components/ui/text";
import { Pressable, View } from "react-native";

export const AudienceSheet = ({
  open,
  onClose,
  options,
  selectedType,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  options: AudienceOption[];
  selectedType: AudienceType;
  onSelect: (type: AudienceType) => void;
}) => (
  <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <SheetHeader onClose={onClose}>
      <SheetTitle>Choose audience</SheetTitle>
    </SheetHeader>
    <SheetContent>
      <View className="px-2 py-2">
        {options.map((option) => {
          const isSelected = option.type === selectedType;
          return (
            <Pressable
              key={option.type}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${option.label}, ${option.count} recipients`}
              onPress={() => {
                onSelect(option.type);
                onClose();
              }}
              className="flex-row items-center justify-between gap-3 px-4 py-4"
            >
              <View className="flex-1">
                <Text className="text-base font-medium">{option.label}</Text>
                <Text className="text-sm text-muted-foreground">
                  {option.count.toLocaleString()} {option.count === 1 ? "recipient" : "recipients"}
                </Text>
              </View>
              {isSelected ? (
                <LineIcon name="check" size={20} className="text-accent" />
              ) : (
                <View className="h-5 w-5 rounded-full border border-border" />
              )}
            </Pressable>
          );
        })}
      </View>
    </SheetContent>
  </Sheet>
);
