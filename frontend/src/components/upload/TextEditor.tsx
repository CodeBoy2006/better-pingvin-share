import { Button, Group, Textarea } from "@mantine/core";
import { useState } from "react";
import { FormattedMessage } from "react-intl";

const TextEditor = ({
  initialText,
  onSave,
  onCancel,
}: {
  initialText: string;
  onSave: (nextText: string) => void;
  onCancel: () => void;
}) => {
  const [text, setText] = useState(initialText);

  return (
    <>
      <Textarea
        autosize
        minRows={16}
        maxRows={24}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
      />
      <Group position="right" mt="md">
        <Button variant="default" onClick={onCancel}>
          <FormattedMessage id="common.button.cancel" />
        </Button>
        <Button onClick={() => onSave(text)}>
          <FormattedMessage id="common.button.save" />
        </Button>
      </Group>
    </>
  );
};

export default TextEditor;
