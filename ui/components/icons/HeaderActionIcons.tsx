import Svg, { Path, Rect } from "react-native-svg";
import type { ReactNode } from "react";

type Props = {
  color: string;
  size?: number;
};

function Root({
  size = 30,
  children,
}: {
  size?: number;
  children: ReactNode;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30" fill="none">
      {children}
    </Svg>
  );
}

export function HeaderIconCopy({ color, size }: Props) {
  return (
    <Root size={size}>
      <Rect x="21" y="7.67188" width="1.33333" height="1.33333" fill={color} />
      <Rect x="19.6641" y="10.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="18.3359" y="6.33594" width="1.33333" height="1.33333" fill={color} />
      <Rect x="18.3359" y="7.67188" width="1.33333" height="1.33333" fill={color} />
      <Rect x="18.3359" y="9" width="1.33333" height="1.33333" fill={color} />
      <Rect x="6.33594" y="22.3281" width="1.33333" height="1.33333" fill={color} />
      <Rect x="7.67188" y="22.3281" width="1.33333" height="1.33333" fill={color} />
      <Rect x="9" y="22.3281" width="1.33333" height="1.33333" fill={color} />
      <Rect x="10.3359" y="22.3281" width="1.33333" height="1.33333" fill={color} />
      <Rect x="11.6641" y="22.3281" width="1.33333" height="1.33333" fill={color} />
      <Rect x="12.9922" y="22.3281" width="1.33333" height="1.33333" fill={color} />
      <Rect x="14.3359" y="22.3281" width="1.33333" height="1.33333" fill={color} />
      <Rect x="15.6641" y="22.3281" width="1.33333" height="1.33333" fill={color} />
      <Rect x="15.6641" y="21" width="1.33333" height="1.33333" fill={color} />
      <Rect x="15.6641" y="19.6641" width="1.33333" height="1.33333" fill={color} />
      <Rect x="22.3281" y="9" width="1.33333" height="1.33333" fill={color} />
      <Rect x="22.3281" y="10.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="21" y="10.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="17.0078" y="18.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="18.3359" y="18.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="19.6641" y="18.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="21" y="18.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="22.3281" y="18.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="22.3281" y="17.0078" width="1.33333" height="1.33333" fill={color} />
      <Rect x="22.3281" y="15.6641" width="1.33333" height="1.33333" fill={color} />
      <Rect x="22.3281" y="14.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="22.3281" y="12.9922" width="1.33333" height="1.33333" fill={color} />
      <Rect x="22.3281" y="11.6641" width="1.33333" height="1.33333" fill={color} />
      <Rect x="19.6641" y="6.33594" width="1.33333" height="1.33333" fill={color} />
      <Rect x="18.3359" y="10.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="17.0078" y="6.33594" width="1.33333" height="1.33333" fill={color} />
      <Rect x="15.6641" y="6.33594" width="1.33333" height="1.33333" fill={color} />
      <Rect x="14.3359" y="6.33594" width="1.33333" height="1.33333" fill={color} />
      <Rect x="12.9922" y="6.33594" width="1.33333" height="1.33333" fill={color} />
      <Rect x="12.9922" y="7.67188" width="1.33333" height="1.33333" fill={color} />
      <Rect x="12.9922" y="9" width="1.33333" height="1.33333" fill={color} />
      <Rect x="10.3359" y="10.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="11.6641" y="10.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="12.9922" y="10.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="9" y="10.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="7.67188" y="10.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="6.33594" y="10.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="6.33594" y="11.6641" width="1.33333" height="1.33333" fill={color} />
      <Rect x="12.9922" y="11.6641" width="1.33333" height="1.33333" fill={color} />
      <Rect x="6.33594" y="12.9922" width="1.33333" height="1.33333" fill={color} />
      <Rect x="12.9922" y="12.9922" width="1.33333" height="1.33333" fill={color} />
      <Rect x="6.33594" y="14.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="12.9922" y="14.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="6.33594" y="15.6641" width="1.33333" height="1.33333" fill={color} />
      <Rect x="12.9922" y="15.6641" width="1.33333" height="1.33333" fill={color} />
      <Rect x="6.33594" y="17.0078" width="1.33333" height="1.33333" fill={color} />
      <Rect x="12.9922" y="17.0078" width="1.33333" height="1.33333" fill={color} />
      <Rect x="6.33594" y="18.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="12.9922" y="18.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="14.3359" y="18.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="15.6641" y="18.3359" width="1.33333" height="1.33333" fill={color} />
      <Rect x="6.33594" y="19.6641" width="1.33333" height="1.33333" fill={color} />
      <Rect x="6.33594" y="21" width="1.33333" height="1.33333" fill={color} />
    </Root>
  );
}

export function HeaderIconEdit({ color, size }: Props) {
  return (
    <Root size={size}>
      <Rect x="22.3359" y="6.32812" width="1.33307" height="1.33336" fill={color} />
      <Rect x="21" y="7.66406" width="1.33307" height="1.33336" fill={color} />
      <Rect x="19.6719" y="9" width="1.33307" height="1.33336" fill={color} />
      <Rect x="19.6719" y="7.67188" width="1.33307" height="1.33336" fill={color} />
      <Rect x="21" y="9" width="1.33307" height="1.33336" fill={color} />
      <Rect x="5" y="20.9922" width="1.33307" height="1.33336" fill={color} />
      <Rect x="5" y="22.3359" width="1.33307" height="1.33336" fill={color} />
      <Rect x="5" y="23.6641" width="1.33307" height="1.33336" fill={color} />
      <Rect x="6.32812" y="23.6641" width="1.33307" height="1.33336" fill={color} />
      <Rect x="7.66406" y="23.6641" width="1.33307" height="1.33336" fill={color} />
      <Rect x="8.99219" y="17.0078" width="1.33307" height="1.33336" fill={color} />
      <Rect x="7.66406" y="18.3359" width="1.33307" height="1.33336" fill={color} />
      <Rect x="6.32812" y="19.6641" width="1.33307" height="1.33336" fill={color} />
      <Rect x="11.6641" y="19.6641" width="1.33307" height="1.33336" fill={color} />
      <Rect x="10.3281" y="21" width="1.33307" height="1.33336" fill={color} />
      <Rect x="9" y="22.3359" width="1.33307" height="1.33336" fill={color} />
      <Rect x="6.33594" y="22.3359" width="1.33307" height="1.33336" fill={color} />
      <Rect x="7.66406" y="21" width="1.33307" height="1.33336" fill={color} />
      <Rect x="23.6641" y="7.66406" width="1.33307" height="1.33336" fill={color} />
      <Rect x="22.3359" y="9" width="1.33307" height="1.33336" fill={color} />
      <Rect x="21" y="10.3281" width="1.33307" height="1.33336" fill={color} />
      <Rect x="18.3281" y="12.9922" width="1.33307" height="1.33336" fill={color} />
      <Rect x="19.6719" y="11.6641" width="1.33307" height="1.33336" fill={color} />
      <Rect x="17" y="14.3281" width="1.33307" height="1.33336" fill={color} />
      <Rect x="15.6641" y="15.6641" width="1.33307" height="1.33336" fill={color} />
      <Rect x="14.3359" y="17.0078" width="1.33307" height="1.33336" fill={color} />
      <Rect x="12.9922" y="18.3359" width="1.33307" height="1.33336" fill={color} />
      <Rect x="21" y="5" width="1.33307" height="1.33336" fill={color} />
      <Rect x="21" y="6.32812" width="1.33307" height="1.33336" fill={color} />
      <Rect x="22.3359" y="7.66406" width="1.33307" height="1.33336" fill={color} />
      <Rect x="19.6719" y="6.32812" width="1.33307" height="1.33336" fill={color} />
      <Rect x="18.3281" y="7.66406" width="1.33307" height="1.33336" fill={color} />
      <Rect x="15.6641" y="10.3281" width="1.33307" height="1.33336" fill={color} />
      <Rect x="17" y="9" width="1.33307" height="1.33336" fill={color} />
      <Rect x="14.3359" y="11.6641" width="1.33307" height="1.33336" fill={color} />
      <Rect x="12.9922" y="12.9922" width="1.33307" height="1.33336" fill={color} />
      <Rect x="11.6641" y="14.3281" width="1.33307" height="1.33336" fill={color} />
      <Rect x="10.3281" y="15.6641" width="1.33307" height="1.33336" fill={color} />
    </Root>
  );
}

export function HeaderIconKey({ color, size }: Props) {
  return (
    <Root size={size}>
      <Rect
        width="1.33333"
        height="1.33333"
        transform="matrix(0.866032 -0.499988 0.500012 0.866018 18.7578 8.26562)"
        fill={color}
      />
      <Rect
        width="1.33333"
        height="1.33333"
        transform="matrix(0.866032 -0.499988 0.500012 0.866018 20.5781 8.75781)"
        fill={color}
      />
      <Rect x="21" y="5" width="1.33334" height="1.33332" fill={color} />
      <Rect x="22.3359" y="6.33594" width="1.33334" height="1.33332" fill={color} />
      <Rect x="17" y="6.33594" width="1.33334" height="1.33332" fill={color} />
      <Rect x="15.6641" y="7.66406" width="1.33334" height="1.33332" fill={color} />
      <Rect x="15.6641" y="11.6641" width="1.33334" height="1.33332" fill={color} />
      <Rect x="13" y="14.3359" width="1.33334" height="1.33332" fill={color} />
      <Rect x="14.3359" y="12.9922" width="1.33334" height="1.33332" fill={color} />
      <Rect x="11.6641" y="15.6641" width="1.33334" height="1.33332" fill={color} />
      <Rect x="10.3281" y="17" width="1.33334" height="1.33332" fill={color} />
      <Rect x="9" y="18.3359" width="1.33334" height="1.33332" fill={color} />
      <Rect x="7.66406" y="19.6641" width="1.33334" height="1.33332" fill={color} />
      <Rect x="6.33594" y="21" width="1.33334" height="1.33332" fill={color} />
      <Rect x="5" y="22.3281" width="1.33334" height="1.33332" fill={color} />
      <Rect x="6.33594" y="23.6641" width="1.33334" height="1.33332" fill={color} />
      <Rect x="5" y="23.6641" width="1.33334" height="1.33332" fill={color} />
      <Rect x="7.66406" y="22.3281" width="1.33334" height="1.33332" fill={color} />
      <Rect x="14.3359" y="19.6641" width="1.33334" height="1.33332" fill={color} />
      <Rect x="9" y="21" width="1.33334" height="1.33332" fill={color} />
      <Rect x="10.3281" y="19.6641" width="1.33334" height="1.33332" fill={color} />
      <Rect x="11.6641" y="18.3359" width="1.33334" height="1.33332" fill={color} />
      <Rect x="8.99219" y="23.6719" width="1.33334" height="1.33332" fill={color} />
      <Rect x="13" y="17" width="1.33334" height="1.33332" fill={color} />
      <Rect x="14.3359" y="15.6641" width="1.33334" height="1.33332" fill={color} />
      <Rect x="15.6641" y="14.3359" width="1.33334" height="1.33332" fill={color} />
      <Rect x="17" y="12.9922" width="1.33334" height="1.33332" fill={color} />
      <Rect x="14.3359" y="18.3359" width="1.33334" height="1.33332" fill={color} />
      <Rect x="13" y="19.6641" width="1.33334" height="1.33332" fill={color} />
      <Rect x="18.3438" y="12.9922" width="1.33334" height="1.33332" fill={color} />
      <Rect x="21" y="12.9922" width="1.33334" height="1.33332" fill={color} />
      <Rect x="22.3359" y="11.6641" width="1.33334" height="1.33332" fill={color} />
      <Rect x="23.6641" y="10.3359" width="1.33334" height="1.33332" fill={color} />
      <Rect x="23.6641" y="7.66406" width="1.33334" height="1.33332" fill={color} />
      <Rect x="19.6719" y="5" width="1.33334" height="1.33332" fill={color} />
      <Rect x="18.3438" y="5" width="1.33334" height="1.33332" fill={color} />
      <Rect x="15.6641" y="9" width="1.33334" height="1.33332" fill={color} />
      <Rect x="15.6641" y="10.3359" width="1.33334" height="1.33332" fill={color} />
      <Rect x="19.6719" y="12.9922" width="1.33334" height="1.33332" fill={color} />
      <Rect x="23.6641" y="9" width="1.33334" height="1.33332" fill={color} />
      <Rect x="23.6641" y="9" width="1.33334" height="1.33332" fill={color} />
      <Rect
        width="1.33333"
        height="1.33333"
        transform="matrix(0.866032 -0.499988 0.500012 0.866018 20.0859 10.5781)"
        fill={color}
      />
      <Rect
        width="1.33333"
        height="1.33333"
        transform="matrix(0.866032 -0.499988 0.500012 0.866018 19.4219 9.42188)"
        fill={color}
      />
      <Rect
        width="1.33333"
        height="1.33333"
        transform="matrix(0.866032 -0.499988 0.500012 0.866018 18.2734 10.0859)"
        fill={color}
      />
    </Root>
  );
}

export function HeaderIconRu({ color, size }: Props) {
  return (
    <Root size={size}>
      <Path
        d="M10.9367 5.67057C12.0186 5.69918 13.343 6.0386 13.8429 6.18099C14.4731 6.36063 15.0242 6.7434 15.4627 7.16407C15.9219 7.60473 16.2174 8.08126 16.4262 8.47527C16.5253 8.66216 16.6283 8.87602 16.7088 9.14324C16.7924 9.42085 16.8654 9.79738 16.8012 10.2175C16.735 10.6505 16.5291 11.085 16.1281 11.4766C15.3702 12.2159 14.6398 12.5285 14.1867 12.7292C13.9881 12.8171 13.1974 13.1361 12.5877 13.2565C12.3373 13.3059 11.9589 13.3418 11.5382 13.3698C11.6638 13.4759 11.808 13.596 11.9627 13.7331C12.451 14.1657 13.0928 14.7585 13.8338 15.4571C14.7656 16.3355 15.8935 17.6659 16.1945 18.056C16.4032 18.3266 17.1812 19.2552 18.0278 20.2774C18.479 20.8222 18.7913 21.1968 18.9718 21.3868C19.2254 21.6537 19.2139 22.0759 18.9471 22.3295C18.6801 22.5824 18.2591 22.5714 18.0057 22.3047C17.7855 22.073 17.4359 21.6535 17.0005 21.1277C16.1741 20.13 15.3656 19.1643 15.1385 18.8698C14.8687 18.5201 13.7883 17.2459 12.9197 16.4271C12.1824 15.732 11.5517 15.1497 11.0786 14.7305C10.8418 14.5207 10.6488 14.356 10.5044 14.2396C10.432 14.1813 10.3757 14.1386 10.3364 14.1107C10.3219 14.1004 10.3122 14.0935 10.3065 14.0899C9.97113 13.9437 9.68725 13.8534 9.23357 13.6771C8.91522 13.5534 8.44693 13.4142 8.03176 13.2839C8.02333 13.7061 8.01732 14.0959 8.00962 14.4037C7.98714 15.3032 7.9601 15.4043 7.95624 16.1589C7.94574 18.2151 7.89387 19.6061 7.88202 19.8347C7.8515 20.4238 7.84548 21.1325 7.85077 21.7188C7.85341 22.0105 7.85931 22.269 7.86509 22.4636C7.86799 22.5611 7.87141 22.6414 7.87421 22.7006C7.87657 22.7504 7.87775 22.7741 7.87811 22.78C7.92332 23.1452 7.66389 23.478 7.29869 23.5235C6.93353 23.5687 6.60069 23.3093 6.55521 22.9441C6.53885 22.8123 6.52263 22.3048 6.51745 21.7305C6.51204 21.1323 6.51746 20.3936 6.55 19.7657C6.5605 19.5631 6.61249 18.194 6.62291 16.1524C6.62674 15.4038 6.65631 15.1696 6.6763 14.3698C6.69718 13.534 6.71857 11.9885 6.76093 10.9141C6.78237 10.3706 6.80859 9.95453 6.83385 9.59376C6.85929 9.23056 6.88324 8.93644 6.89895 8.6172C6.91496 8.29182 6.92164 7.96456 6.93411 7.63673C6.94577 7.33039 6.96241 7.01037 7.00182 6.77344C7.03926 6.5486 7.12775 6.19393 7.47057 5.98177C7.61791 5.89086 7.76625 5.85751 7.86379 5.84115C7.95672 5.82561 8.06313 5.81765 8.13462 5.8112C9.04602 5.7288 10.1021 5.64856 10.9367 5.67057ZM23.2569 5.58594C23.625 5.58601 23.9236 5.88446 23.9236 6.25261C23.9236 7.03301 23.9235 7.77465 23.934 8.1836C23.9435 8.55387 23.977 8.99739 23.977 9.57684C23.977 10.3189 24.0453 12.0235 24.0746 12.8854C24.1047 13.7704 24.191 14.6026 24.0317 15.655C24.0056 15.8275 23.9799 16.0537 23.891 16.3125C23.8011 16.5742 23.6563 16.8487 23.4223 17.2058C23.249 17.4702 23.0579 17.7502 22.7765 17.9571C22.4768 18.1772 22.1393 18.2722 21.7556 18.3269C21.4169 18.3751 21.1734 18.4024 20.9119 18.3959C20.6607 18.3896 20.4073 18.3522 20.0629 18.3021C19.5288 18.2242 19.1596 17.9734 18.9106 17.6381C18.7009 17.3553 18.5807 16.9992 18.5187 16.8477C18.3192 16.3603 18.2211 15.8264 18.1528 15.4453C18.0753 15.0133 17.9853 14.4111 17.9223 13.6446C17.8604 12.8905 17.783 11.2924 17.783 10.763C17.783 10.2677 17.726 7.82104 17.7192 7.50001C17.7086 6.99797 17.7088 6.67783 17.7088 6.63282C17.7089 6.26487 18.0075 5.96643 18.3754 5.96615C18.7436 5.96615 19.042 6.2647 19.0421 6.63282C19.0421 6.67148 19.0422 6.98128 19.0525 7.47136C19.0589 7.772 19.1163 10.2487 19.1163 10.763C19.1163 11.2439 19.1903 12.8029 19.2504 13.5352C19.3095 14.2548 19.3931 14.8145 19.464 15.2097C19.5343 15.6016 19.6141 16.0029 19.753 16.3425C19.811 16.4842 19.8337 16.5525 19.8793 16.6563C19.9176 16.7433 19.95 16.8021 19.9809 16.8438C20.0087 16.8812 20.0356 16.9051 20.0655 16.9232C20.0965 16.9418 20.1539 16.967 20.2556 16.9818C20.6241 17.0354 20.79 17.0586 20.9444 17.0625C21.0888 17.0661 21.241 17.0531 21.5681 17.0065C21.8492 16.9665 21.9388 16.9174 21.9861 16.8829C22.0513 16.8349 22.1289 16.7481 22.3077 16.4753C22.511 16.1651 22.591 15.9942 22.6306 15.8789C22.671 15.7611 22.6802 15.6772 22.714 15.4545C22.8494 14.5602 22.7759 13.9088 22.7426 12.9297C22.7142 12.0956 22.6437 10.349 22.6436 9.57684C22.6436 9.00205 22.6127 8.68769 22.6007 8.21876C22.5896 7.78823 22.5903 7.02368 22.5903 6.25261C22.5903 5.88459 22.889 5.58622 23.2569 5.58594ZM10.9015 7.00391C10.1666 6.98452 9.20232 7.05322 8.30129 7.13412C8.28762 7.27272 8.27483 7.45903 8.26613 7.68751C8.25486 7.984 8.24597 8.35105 8.22968 8.6823C8.21306 9.01994 8.18912 9.337 8.16457 9.68751C8.13985 10.0406 8.11367 10.4421 8.09296 10.9675C8.08349 11.2076 8.07836 11.4705 8.07082 11.7435C8.21645 11.7625 8.39766 11.7919 8.59035 11.8386C9.03186 11.9455 9.47954 12.0439 9.80519 12.0638C10.6293 12.1139 11.8626 12.0401 12.3299 11.9479C12.7924 11.8565 13.4757 11.5865 13.6476 11.5104C14.0828 11.3177 14.621 11.084 15.1958 10.5235C15.3953 10.3288 15.4622 10.1553 15.4835 10.0156C15.5068 9.86283 15.483 9.70001 15.4315 9.52866C15.3853 9.37535 15.3253 9.24504 15.2479 9.09897C15.0751 8.77302 14.858 8.43189 14.5395 8.12631C14.2005 7.80115 13.8331 7.56499 13.477 7.46355C12.9893 7.32463 11.8037 7.02777 10.9015 7.00391Z"
        fill={color}
      />
    </Root>
  );
}

export function HeaderIconExit({ color, size }: Props) {
  return (
    <Root size={size}>
      <Rect x="6.33594" y="22.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="7.67188" y="22.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="9" y="22.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="10.3359" y="22.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="11.6641" y="22.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="12.9922" y="22.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="14.3359" y="22.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="15.6641" y="22.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="15.6641" y="19.6641" width="1.33332" height="1.33333" fill={color} />
      <Rect x="15.6641" y="21" width="1.33332" height="1.33333" fill={color} />
      <Rect x="15.6641" y="9" width="1.33332" height="1.33333" fill={color} />
      <Rect x="15.6641" y="7.66406" width="1.33332" height="1.33333" fill={color} />
      <Rect x="15.6641" y="10.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="15.6641" y="18.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="10.3359" y="6.32812" width="1.33332" height="1.33333" fill={color} />
      <Rect x="12.9922" y="6.32812" width="1.33332" height="1.33333" fill={color} />
      <Rect x="14.3359" y="6.32812" width="1.33332" height="1.33333" fill={color} />
      <Rect x="11.6641" y="6.32812" width="1.33332" height="1.33333" fill={color} />
      <Rect x="15.6641" y="6.32812" width="1.33332" height="1.33333" fill={color} />
      <Rect x="9" y="6.32812" width="1.33332" height="1.33333" fill={color} />
      <Rect x="7.67188" y="6.32812" width="1.33332" height="1.33333" fill={color} />
      <Rect x="6.33594" y="6.32812" width="1.33332" height="1.33333" fill={color} />
      <Rect x="6.33594" y="9" width="1.33332" height="1.33333" fill={color} />
      <Rect x="6.33594" y="7.66406" width="1.33332" height="1.33333" fill={color} />
      <Rect x="6.33594" y="10.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="6.33594" y="11.6641" width="1.33332" height="1.33333" fill={color} />
      <Rect x="6.33594" y="12.9922" width="1.33332" height="1.33333" fill={color} />
      <Rect x="6.33594" y="14.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="11.6641" y="14.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="23.6719" y="14.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="22.3359" y="14.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="17.0078" y="14.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="21" y="14.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="15.6641" y="14.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="19.6641" y="14.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="14.3359" y="14.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="18.3359" y="14.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="18.3359" y="14.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="13.0078" y="14.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="22.3359" y="15.6641" width="1.33332" height="1.33333" fill={color} />
      <Rect x="21" y="17.0078" width="1.33332" height="1.33333" fill={color} />
      <Rect x="22.3359" y="12.9922" width="1.33332" height="1.33333" fill={color} />
      <Rect x="21" y="11.6641" width="1.33332" height="1.33333" fill={color} />
      <Rect x="6.33594" y="15.6641" width="1.33332" height="1.33333" fill={color} />
      <Rect x="6.33594" y="17.0078" width="1.33332" height="1.33333" fill={color} />
      <Rect x="6.33594" y="18.3359" width="1.33332" height="1.33333" fill={color} />
      <Rect x="6.33594" y="19.6641" width="1.33332" height="1.33333" fill={color} />
      <Rect x="6.33594" y="21" width="1.33332" height="1.33333" fill={color} />
    </Root>
  );
}

