import { useEffect, useState } from "react";
import QRCodeGenerator from "qrcode";
import CenterLoader from "../core/CenterLoader";

const QRCode = ({ link }: { link: string }) => {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>();

  useEffect(() => {
    setQrCodeUrl(undefined);

    QRCodeGenerator.toDataURL(link, { margin: 2, width: 400 })
      .then(setQrCodeUrl)
      .catch(() => {
        setQrCodeUrl("");
      });
  }, [link]);

  if (!qrCodeUrl) {
    return (
      <div
        style={{
          width: "100%",
          minHeight: 240,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CenterLoader />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt="qrcode"
      src={qrCodeUrl}
      style={{
        width: "100%",
        maxWidth: 320,
        height: "auto",
        alignSelf: "center",
      }}
    />
  );
};

export default QRCode;
